import UIKit
import AVFoundation
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        useLoudAudio()
        // iOS can switch into "call" audio (for the Ask Fluff mic or the camera) and send sound to
        // the ear speaker. Every time the audio route changes, put Fluff back on the loudspeaker.
        NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { _ in
            keepLoudspeaker()
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

/// Lets Fluff talk even when the ring/silent switch is set to silent, and mixes with music
/// instead of stopping it. (The web version can't do this: Safari mutes web audio on silent.)
func useLoudAudio() {
    do {
        try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try AVAudioSession.sharedInstance().setActive(true)
    } catch {
        print("Sparkle House: couldn't set the audio session: \(error)")
    }
}

/// If audio is in call mode and coming out of the ear speaker (and no headphones are plugged in),
/// send it to the loudspeaker instead. Headphones and Bluetooth speakers are left alone.
func keepLoudspeaker() {
    let session = AVAudioSession.sharedInstance()
    guard session.category == .playAndRecord else { return }
    let outputs = session.currentRoute.outputs
    if outputs.contains(where: { $0.portType == .builtInReceiver }) {
        do {
            try session.overrideOutputAudioPort(.speaker)
        } catch {
            print("Sparkle House: couldn't switch to the loudspeaker: \(error)")
        }
    }
}

/// The app's web view, with Fluff's native audio plugin added.
class FluffBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(FluffAudioPlugin())
    }
}

/// Plays Fluff's voice (AI voice audio or the phone's voice) and the chime natively.
/// Audio from inside the web view follows the ring/silent switch; native audio uses the app's
/// .playback session, so Fluff is heard on silent and music keeps playing underneath.
@objc(FluffAudioPlugin)
public class FluffAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FluffAudioPlugin"
    public let jsName = "FluffAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speak", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "chime", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]
    private var voicePlayer: AVAudioPlayer?
    private var chimePlayer: AVAudioPlayer?
    private let synth = AVSpeechSynthesizer()

    /// Gets the audio session ready to play out loud. While the camera is running (Coach Mode), the web view
    /// may have the session in record mode; switching away from that can be refused, so in that case stay in
    /// record mode but send sound to the loudspeaker. Both ignore the silent switch.
    private func prepare() {
        let session = AVAudioSession.sharedInstance()
        do {
            if session.category == .playAndRecord {
                try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .mixWithOthers, .allowBluetoothA2DP])
            } else {
                try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            }
            try session.setActive(true)
        } catch {
            lastError = error.localizedDescription
        }
        keepLoudspeaker()
    }
    private var lastError = ""

    /// What the audio session is doing, for the app's sound test.
    private func status(_ playing: Bool) -> [String: Any] {
        let session = AVAudioSession.sharedInstance()
        return [
            "playing": playing,
            "category": session.category.rawValue.replacingOccurrences(of: "AVAudioSessionCategory", with: ""),
            "output": session.currentRoute.outputs.map { $0.portName }.joined(separator: ", "),
            "volume": session.outputVolume,
            "error": lastError
        ]
    }

    private func stopVoice() {
        voicePlayer?.stop()
        voicePlayer = nil
        if synth.isSpeaking { synth.stopSpeaking(at: .immediate) }
    }

    /// Plays MP3 (or other) audio passed in as base64.
    @objc func play(_ call: CAPPluginCall) {
        guard let b64 = call.getString("data"), let data = Data(base64Encoded: b64) else {
            call.reject("No audio to play.")
            return
        }
        DispatchQueue.main.async {
            self.lastError = ""
            self.prepare()
            self.stopVoice()
            do {
                let player = try AVAudioPlayer(data: data)
                player.volume = 1.0
                player.prepareToPlay()
                let ok = player.play()
                self.voicePlayer = player
                call.resolve(self.status(ok))
            } catch {
                call.reject("Couldn't play the audio: \(error.localizedDescription)")
            }
        }
    }

    /// Speaks text with one of the phone's voices.
    @objc func speak(_ call: CAPPluginCall) {
        let text = call.getString("text") ?? ""
        let voiceId = call.getString("voice") ?? ""
        let rate = call.getFloat("rate") ?? 1.0
        let pitch = call.getFloat("pitch") ?? 1.0
        DispatchQueue.main.async {
            self.prepare()
            self.stopVoice()
            guard !text.isEmpty else { call.resolve(); return }
            let utterance = AVSpeechUtterance(string: text)
            if !voiceId.isEmpty, let voice = AVSpeechSynthesisVoice(identifier: voiceId) {
                utterance.voice = voice
            } else {
                utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
            }
            utterance.rate = min(AVSpeechUtteranceMaximumSpeechRate, AVSpeechUtteranceDefaultSpeechRate * rate)
            utterance.pitchMultiplier = pitch
            self.synth.speak(utterance)
            call.resolve(self.status(true))
        }
    }

    /// The little "chore done" chime (the same sound as the reminders).
    @objc func chime(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = Bundle.main.url(forResource: "fluff-chime", withExtension: "wav", subdirectory: "public") else {
                call.reject("Chime sound not found.")
                return
            }
            self.lastError = ""
            self.prepare()
            do {
                let player = try AVAudioPlayer(contentsOf: url)
                player.volume = 0.8
                let ok = player.play()
                self.chimePlayer = player
                call.resolve(self.status(ok))
            } catch {
                call.reject("Couldn't play the chime: \(error.localizedDescription)")
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.stopVoice()
            call.resolve()
        }
    }
}
