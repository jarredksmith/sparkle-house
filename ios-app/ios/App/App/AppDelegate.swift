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
