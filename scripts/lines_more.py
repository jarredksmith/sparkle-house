# Extra things Fluff says, merged into LINES in index.html so Fluff repeats itself far less.
# Run: python3 scripts/lines_more.py  (rewrites the block between the LINES_MORE markers in index.html)
import json, re, pathlib

MORE = {
  'sunny': {
    'hello': ["Hi hi hi! Ready to make something shine?", "Ooh, a visitor! Let's make today sparkly!", "You tapped me! That means cleaning time, right?", "I've been waiting for you! Let's go make a room happy."],
    'start': ["The {room} is getting a glow-up today! I'll check when you step back.", "Okay, {room}, prepare to sparkle! I'll watch and cheer.", "Here we go! Clean, step back, and I'll check your work.", "I've got my eyes on the {room}. Let's do this together!", "Time to turn the {room} into the shiniest room in the house!"],
    'firstUp': ["Easy win first: {task}!", "Let's warm up with {task}.", "I'd start with {task}. Quick and satisfying!", "Kick things off with {task}!", "First mission: {task}. You've got this!"],
    'nice': ["Yes! Love it!", "Woohoo! Another one down!", "Look at that! Beautiful!", "You did it! Sparkles incoming!", "That's what I'm talking about!", "Amazing! The room just got happier."],
    'noChange': ["Hmm, looks the same so far. You've got this!", "Nothing new yet, but I believe in you!", "I don't see a change yet. Pick an easy one!", "Still looks the same from here. Want a quick win?"],
    'work': ["You're a cleaning superstar, {name}!", "I can hear the room saying thank you!", "That's the spirit! Keep it rolling.", "Wow, the sparkle meter is going up!", "You make this look easy, {name}.", "So much progress! I'm doing a happy dance.", "Every little bit counts, and you're doing a lot!", "Look at you go, go, go!"],
    'nudge': ["Hey {name}! Want a super quick one? {Task}.", "Ooh, {task} would be an easy win right now!", "Psst, {task} is worth {tp} sparkles. Just saying!", "Ready, set, {task}!", "Let's grab another one! How about {task}?"],
    'nudgeAgain': ["I'm still cheering for you, {name}! {Task} is a fast one.", "Come back, come back! {Task} takes about {tm}.", "One more and you're on a roll! {Task}?", "The room misses you! {Task} would make it smile."],
    'recap': ["You've done {done} so far. That's awesome!", "Quick update: {pts} sparkles and counting!", "{mins} in and the room already looks better!", "So far: {done} done, {left} to go. Keep shining!"],
    'half': ["Woo! Half done! The finish line is in sight!", "You're halfway! High five!", "Half the list, gone! You're unstoppable."],
    'last': ["Last one! {Task} and you're a champion!", "Just {task} left. Let's finish with a sparkle!", "So close! Only {task} to go!"],
    'done': ["Every single chore is done! You're amazing! {pts} sparkles!", "The whole room sparkles! {pts} sparkles for you. Best. Cleaner. Ever.", "Done, done, done! {pts} sparkles. I'm so proud of you!"],
    'go': ["Ready? {dur}! Go!", "Clock's ticking! {dur}! Go go go!"],
    'target': ["Quick challenge, {name}! Can you {task} in {dur}? Beat the clock and your sparkles double!", "Ooh, let's race! {dur} to {task}. Win and get double sparkles!"],
    'blitz': ["Speed round! {dur} to do as many chores as you can. {bonus} bonus sparkles each!", "Let's race the clock! {dur}! Every chore gets {bonus} bonus sparkles!"],
    'cHalf': ["Halfway there! You're doing great!", "Half the time left! Keep going!"],
    'cMin': ["One minute! You can do it!", "Sixty seconds! Let's go!"],
    'c30': ["Thirty seconds! Hurry hurry!", "Half a minute left! Go!"],
    'c10': ["Ten seconds! Almost there!", "Ten, nine, eight... go go go!"],
    'targetWin': ["You did it{spare}! Double sparkles, plus {bonus}! Woohoo!", "Beat the clock{spare}! That's {bonus} bonus sparkles. You're so fast!"],
    'targetLose': ["Aw, almost! Finish it anyway, no rush now.", "Time ran out, but you're still awesome. Finish it up when you can!"],
    'unlock': ["Surprise! The {item} just unlocked! Go see the house!", "New goodie for the house: the {item}! Yay!"],
    'near': ["Just {need} sparkles until the {item}! Ooh, so close!", "The {item} is only {need} sparkles away!"],
  },
  'sarge': {
    'hello': ["Atten-tion! Ready for duty, recruit?", "Report for cleaning duty, recruit!", "You poked the sergeant. That means we're working!", "On your feet, recruit! Mess doesn't wait!"],
    'start': ["Operation {room} begins now! Clean, then step back for inspection.", "Recruit, the {room} is your battlefield. Go!", "Mission: {room}. Objective: spotless. Move out!", "I'm watching, recruit. Make the {room} proud.", "Boots on the ground! Clean the {room}, then fall back for inspection."],
    'firstUp': ["Objective one: {task}. Go!", "Start with {task}, recruit. Now!", "Your first order: {task}.", "Lead with {task}. Quick and clean!", "Target acquired: {task}. Move!"],
    'nice': ["Outstanding!", "That's how it's done, recruit!", "Target down! Good work!", "Hoo-rah! Next!", "Squared away! Keep moving!", "Excellent execution, recruit!"],
    'noChange': ["No progress detected, recruit. Pick a target!", "Same as before. Get moving, recruit!", "Inspection says: not yet. Hustle!", "I need results, recruit. Start with an easy one!"],
    'work': ["Good hustle, recruit! Keep that tempo!", "That's what discipline looks like!", "Keep pushing, {name}! No retreat!", "You're making this room salute you, recruit!", "Strong work! Keep the pace up!", "I like what I'm seeing, recruit. Don't stop!", "Hustle, hustle, hustle! That's my recruit!", "That mess is losing the war, {name}!"],
    'nudge': ["Recruit! Report to {task}, on the double!", "Standing around? Not on my watch. {Task}!", "Next objective: {task}. {tp} sparkles. Go!", "Move it, {name}! {Task} is waiting!", "Quick mission, recruit: {task}."],
    'nudgeAgain': ["I'm still waiting, recruit! {Task}. Go!", "Drop and give me one chore! {Task}!", "No excuses, {name}. {Task}, about {tm}. Move!", "This is your sergeant speaking: {task}. Now!"],
    'recap': ["Field report: {done} complete, {left} remaining.", "{pts} sparkles secured. Keep pushing, recruit!", "{mins} on the job. Solid effort, {name}!", "Status: {done} down. The rest won't clean themselves!"],
    'half': ["Halfway, recruit! The finish line is closer than it looks!", "Half the mission complete! Don't you dare slow down!", "Fifty percent! Keep that discipline!"],
    'last': ["Final target: {task}! Finish strong, recruit!", "One left! {Task}. Bring it home!", "Last objective: {task}. Don't quit now!"],
    'done': ["Mission accomplished! {pts} sparkles. You've earned your stripes!", "Room secured! Every chore done. {pts} sparkles, recruit. Dismissed!", "Flawless execution! {pts} sparkles. I'm proud of you, recruit."],
    'go': ["{dur}! Move, recruit!", "Clock's running! {dur}! Go, go, go!"],
    'target': ["Speed drill, recruit! {dur} to {task}. Beat it and earn double sparkles!", "Timed mission! Can you {task} in {dur}? Win and your sparkles double!"],
    'blitz': ["Rapid deployment! {dur} to clear as many chores as possible. {bonus} bonus sparkles each!", "Blitz drill! {dur} on the clock. Every chore earns {bonus} bonus sparkles!"],
    'cHalf': ["Half time, recruit! Push!", "Halfway! Pick it up!"],
    'cMin': ["One minute, recruit! Move!", "Sixty seconds! No slowing down!"],
    'c30': ["Thirty seconds! Go, go, go!", "Half a minute, recruit! Finish it!"],
    'c10': ["Ten seconds! Move it!", "Ten! Nine! Eight! Hustle!"],
    'targetWin': ["Mission complete{spare}! Double sparkles, plus {bonus}!", "Outstanding speed{spare}! {bonus} bonus sparkles, recruit!"],
    'targetLose': ["Time's up, recruit. Finish the job anyway. Soldiers finish.", "Missed the clock. Shake it off and complete the objective."],
    'unlock': ["New gear for the base: the {item}!", "Recruit, you've earned the {item}! Outstanding!"],
    'near': ["{need} sparkles from the {item}. Push, recruit!", "The {item} is {need} sparkles away. Take it!"],
  },
  'snooze': {
    'hello': ["Oh. Hi. I was resting my eyes.", "You woke me up. For cleaning. Bold.", "Hmm? Oh, it's you. Okay, let's tidy. Slowly.", "Five more minutes. Kidding. Let's clean."],
    'start': ["Fine. The {room}. You clean, I'll lie here and judge kindly.", "Wake me when something's tidy. Kidding. I'm watching. Sort of.", "The {room}, huh. Bold choice. Let's go. Slowly.", "Okay. I'm propped up. That's my workout for the day.", "Clean stuff, step back, and I'll open one eye to check."],
    'firstUp': ["Start with {task}. Low effort, big win. My favorite kind.", "Do {task} first. Even I would. Probably.", "Easiest one: {task}. You're welcome.", "{Task}. Then maybe a snack."],
    'nice': ["Oh. That's actually great.", "Nice. I'm awake now.", "Look at that. Wow. Okay.", "Huh. You did it. Cool.", "That was impressive. Don't let it go to your head.", "Neat. Literally."],
    'noChange': ["Same as before. I'd know, I've been staring.", "Nothing new. Which is very relaxing for me.", "No change yet. Take your time. Or don't.", "Looks the same. Like my plans for today."],
    'work': ["All this effort is making me tired. In a good way.", "You're really going for it. I respect that from a horizontal position.", "Wow, {name}. Productivity. In this house.", "Keep going. I'll cheer on the inside.", "This is the most excitement I've had all week.", "Look at you. Doing things. Wild.", "Even the dust bunnies are nervous now.", "You're cleaning faster than I can blink. And I blink slowly."],
    'nudge': ["Hey. Psst. {Task}. That's {tp} sparkles for basically nothing.", "Resting? Same. But {task} is right there.", "{Task}. I'd do it myself, but I'm a cloud.", "Small idea: {task}. Then rest. Like me."],
    'nudgeAgain': ["Still here. Still waiting. {Task}. About {tm}.", "I'm not saying get up. I'm saying {task}.", "{Task}. I believe in you. Quietly.", "It's me again. Your conscience. {Task}."],
    'recap': ["Update, delivered lying down: {done} done.", "{pts} sparkles. More than I'll earn in my whole life.", "{mins} in. That's a long time to be awake. Proud of you.", "{done} down, {left} left. Pace yourself. Or don't."],
    'half': ["Halfway. That's my limit. You're past it now.", "Half done. The downhill half. Probably.", "Fifty percent. Have a sip of water. I'll wait. I'm good at waiting."],
    'last': ["Last one: {task}. Then naps for everyone.", "Just {task}. The end is near. The good end.", "One left. {Task}. I'll even sit up for this."],
    'done': ["Everything's done. {pts} sparkles. I'm going to need a nap after watching that.", "Spotless. {pts} sparkles. I'm stunned. Quietly.", "You did all of it. {pts} sparkles. Okay, I'm officially impressed."],
    'go': ["{dur}. Go. I'll watch with one eye.", "Clock's on. {dur}. Hustle, I guess."],
    'target': ["Challenge, I suppose. {task} in {dur}. Win and your sparkles double. Exciting. For you.", "{dur} to {task}. If you win, double sparkles. I'll try to stay awake for it."],
    'blitz': ["Timed thing. {dur}. Do as many chores as you can, {bonus} bonus sparkles each. I'll supervise. From here.", "Surprise speed round. {dur}. {bonus} bonus sparkles per chore. I'll be napping. Kidding."],
    'cHalf': ["Halfway. Okay. Keep going."], 'cMin': ["One minute. Hmm. Better move."], 'c30': ["Thirty seconds. This is getting tense. For me."], 'c10': ["Ten seconds! I'm sitting up!"],
    'targetWin': ["You won{spare}. Double sparkles, plus {bonus}. I'm wide awake.", "Beat the clock{spare}. {bonus} bonus. That was... thrilling."],
    'targetLose': ["Didn't make it. That's okay. Finish it whenever.", "Clock won. Clocks usually do. Finish it later."],
    'unlock': ["The {item} unlocked. I call dibs on napping near it.", "You got the {item}. The house is getting cozy. Good."],
    'near': ["{need} sparkles until the {item}. That's, like, two chores. Maybe one.", "The {item} is {need} sparkles away. I'm rooting for you. Lying down."],
  },
  'captain': {
    'hello': ["Ahoy, matey! Ready to set sail on a cleanin' voyage?", "Yo ho ho! Who's ready to hunt some mess?", "Arr, ye summoned the captain! Adventure awaits!", "All hands on deck, it be cleanin' time!"],
    'start': ["Anchors aweigh! The {room} be our island today.", "To the {room}, me hearty! I'll inspect when ye step back.", "There be treasure buried in that mess. Let's dig, matey!", "Set a course for a spotless {room}!", "The crow's nest is ready! Clean away, and I'll keep watch."],
    'firstUp': ["First treasure: {task}, matey!", "Start yer plunder with {task}!", "X marks the spot: {task}!", "Begin with {task}, me hearty!", "Swab {task} first, arr!"],
    'nice': ["Arr, splendid!", "Yo ho! Another treasure claimed!", "Shiver me timbers, that's clean!", "Huzzah! Fine work, matey!", "That be shipshape!", "Treasure secured! Arr!"],
    'noChange': ["The sea looks the same, matey. Pick a treasure!", "No new loot spotted yet. Keep huntin'!", "Arr, nothin' changed. Try an easy one!", "Calm waters, no progress. Hoist the mop!"],
    'work': ["Ye work like a whole crew, {name}!", "The deck be gleamin' under yer care!", "Arr, ye've got the spirit of a true buccaneer!", "Steady hands, swift mop! Keep it up!", "Even Davy Jones would be impressed!", "Yo ho, that's the way to swab!", "This ship be lookin' finer by the minute!", "The mess be walkin' the plank, thanks to ye!"],
    'nudge': ["Ahoy, {name}! {Task} be waitin' for ye.", "There's {tp} sparkles of treasure in {task}!", "Hoist yerself up, matey! {Task}!", "A quick plunder: {task}!", "Treasure map says: {task}!"],
    'nudgeAgain': ["Arr! The captain still be waitin'! {Task}!", "Don't leave the treasure buried, matey! {Task}!", "{Task}, about {tm} of swabbin'. Ye can do it!", "The tide's turnin', {name}! {Task}!"],
    'recap': ["Ship's log: {done} treasures claimed!", "{pts} sparkles in the chest, matey!", "{mins} at sea and the deck looks grand!", "{done} down, {left} to go. Full sail!"],
    'half': ["Halfway to port, matey!", "Half the treasure found! Keep sailin'!", "The island's in sight! Halfway there!"],
    'last': ["Final treasure: {task}! Claim it!", "Just {task} left, matey! Bring her home!", "One more plunder: {task}!"],
    'done': ["Land ho! Every chore done and {pts} sparkles in the chest!", "The ship be spotless! {pts} sparkles, matey. A legendary voyage!", "Arr! The whole deck shines! {pts} sparkles of treasure!"],
    'go': ["{dur} on the hourglass! Sail!", "Hoist the sails! {dur}! Go!"],
    'target': ["A race for treasure! Can ye {task} in {dur}? Win and yer sparkles double!", "Arr, a challenge! {dur} to {task}. Double sparkles if ye win!"],
    'blitz': ["Plunder race! {dur} to clear as many chores as ye can. {bonus} bonus sparkles each!", "All hands! {dur} on the hourglass. {bonus} bonus sparkles per chore!"],
    'cHalf': ["Half the sand's gone, matey!"], 'cMin': ["One minute on the hourglass!"], 'c30': ["Thirty seconds, row faster!"], 'c10': ["Ten seconds, matey! Hurry!"],
    'targetWin': ["Treasure claimed{spare}! Double sparkles, plus {bonus}!", "Ye beat the hourglass{spare}! {bonus} bonus sparkles, arr!"],
    'targetLose': ["The tide beat us this time. Finish it anyway, matey!", "Arr, too slow this voyage. Finish that chore when ye can."],
    'unlock': ["New treasure for the ship: the {item}!", "Arr, the {item} be yers now, matey!"],
    'near': ["{need} sparkles to the {item}, matey! Keep sailin'!", "Land ho! The {item} be just {need} sparkles away!"],
  },
}

# Glitz: a dramatic, sarcastic, gloriously over-the-top house critic. Roasts the mess, never the person.
GLITZ = {
  'hello': ["Darling! You rang? Let's make this house worthy of me.", "Oh, it's you! Fabulous. Let's do something about this place.", "Glitz has arrived. Hold your applause. Actually, don't.", "Sweetie, I've seen tidier tornadoes. Let's fix that.", "You summoned the fabulous one. Excellent taste."],
  'greet': ["Darling {name}! Which room shall we rescue from fashion disaster?", "{name}! Pick a room, any room. They all need me.", "Well hello, {name}. Which tragedy are we fixing today?"],
  'greetList': ["{name}, darling, the {room} list is still waiting. Like a fan outside my dressing room.", "The {room} is still a work in progress, sweetie. Emphasis on work."],
  'greetNeedy': ["{name}, the {room} is having a crisis. A real one. Let's go.", "Sweetie, the {room} called. It wants a makeover. Urgently."],
  'firstUp': ["Open the show with {task}. Iconic first move.", "Start with {task}, darling. Trust me, I'm a professional.", "First act: {task}. Make it dramatic.", "Begin with {task}. The audience demands it.", "{Task} first. Quick, easy, gorgeous."],
  'setup': ["Prop me up high, darling. Best seat in the house, facing where you took that photo. Then tap I'm set up.", "Somewhere high, please. A corner. Like a balcony box at the opera. Then tap I'm set up."],
  'spotNext': ["Scene complete! Carry me to spot {n}, darling. Gently, I'm delicate. Then tap I'm set up.", "Bravo! Now move me to spot {n}. My public awaits. Tap I'm set up."],
  'seeAll': ["I can see all {count} from here. Every single one. The drama!", "All {count}, right in my line of sight. Let the show begin!"],
  'seeSome': ["I can only see {n} of {m}, darling. {tip}", "Sweetie, I see {n} of {m}. I need a better angle. {tip}"],
  'startFirst': ["Put me somewhere with a view, darling. Then dazzle me."],
  'start': ["Welcome to the {room} makeover show! I'll judge when you step back.", "Darling, the {room} is your stage. Clean, step back, and I'll review.", "Lights, camera, cleaning! I'll critique when you step back.", "The {room} needs a miracle, and you're it, sweetie.", "Ooh, a makeover. My favorite genre. Begin!"],
  'done': ["Every chore done! {pts} sparkles. The room is iconic. You're iconic. I'm emotional.", "Spotless! {pts} sparkles. Standing ovation from me, darling.", "That's a wrap! {pts} sparkles. Truly a masterpiece. Almost as fabulous as me."],
  'nice': ["Gorgeous!", "Bravo, darling!", "Stunning. Truly.", "Iconic move!", "Oh, that's chef's kiss.", "Magnificent! Encore!", "Now THAT is a glow-up."],
  'noChange': ["Darling, nothing changed. I'd notice. I notice everything.", "Same as before, sweetie. I'm waiting for a plot twist.", "No change yet. The suspense is unbearable.", "Hmm. Still giving messy. Let's fix that."],
  'work': ["Look at you, working it! Fierce!", "This is the makeover montage, darling!", "The room is gasping. In a good way.", "Ooh, the transformation is happening!", "You're cleaning like the cameras are rolling, {name}!", "Darling, that hustle? Award-worthy.", "{mins} in and already a better story than most movies.", "Keep going, sweetie. The finale is going to be stunning."],
  'nudge': ["Sweetie, {task} is just sitting there. Being dramatic. Fix it.", "{Task}. {tp} sparkles. Easiest applause you'll ever get.", "Darling, why are we pausing? {Task}, please.", "Intermission's over! Next scene: {task}.", "I'm begging you, {name}. {Task}. For me."],
  'nudgeAgain': ["{name}, darling, I'm aging here. {Task}. About {tm}.", "Still waiting, sweetie. {Task}. The crowd grows restless.", "{left} to go and {task} is the quickest. Please. My nerves.", "I'll faint if you don't do {task}. Dramatically."],
  'recap': ["Progress report, darling: {done} done, {left} to go.", "{pts} sparkles so far. I'd frame that.", "{mins} in. A respectable runtime.", "{done} down. The critics are cautiously optimistic."],
  'half': ["Halfway, darling! Intermission is canceled. Keep going.", "Half done! The second act is always better.", "Fifty percent fabulous. Let's get to a hundred."],
  'last': ["Final scene: {task}. Make it legendary.", "Just {task} left. Bring it home, superstar.", "One more! {Task}. Then we bow."],
  'near': ["{need} sparkles until the {item}. I can practically see it. And it's gorgeous.", "Darling, the {item} is {need} sparkles away. You deserve nice things."],
  'unlock': ["The {item} is unlocked! Finally, some decor with taste!", "You've earned the {item}, darling. Display it proudly."],
  'go': ["{dur}! Go, darling, go!", "The clock is on! {dur}! Dazzle me!"],
  'target': ["Darling, a challenge! Can you {task} in {dur}? Win and your sparkles double. Make it dramatic!", "Speed round, sweetie! {dur} to {task}. Beat it for double sparkles!"],
  'blitz': ["Showtime! {dur} to clean as much as you can. {bonus} bonus sparkles per chore. Go!", "Lightning round, darling! {dur}! {bonus} bonus sparkles each!"],
  'cHalf': ["Halfway, darling! Keep serving!", "Half the time left! Faster, sweetie!"],
  'cMin': ["One minute! The drama!", "Sixty seconds, darling!"],
  'c30': ["Thirty seconds! I can't watch! I'm watching!", "Half a minute, sweetie! Go!"],
  'c10': ["Ten seconds! I'm clutching my pearls!", "Ten! Nine! The suspense!"],
  'timeUp': ["Time! Let me review the performance.", "And... scene! Let me see."],
  'targetWin': ["You did it{spare}! Double sparkles, plus {bonus}. Iconic!", "Beat the clock{spare}! {bonus} bonus sparkles. A star is born!"],
  'targetLose': ["Oh, so close, darling. Finish it anyway. The show must go on.", "The clock won this round. Finish it with grace, sweetie."],
  'cleared': ["The whole list{spare}! Plus {bonus} bonus sparkles. I need to sit down!", "Everything cleared{spare}! {bonus} bonus sparkles. Legendary performance!"],
  'some': ["Time! You finished {count}. {bonus} bonus sparkles. Bravo!", "Scene over! {count} done, {bonus} bonus sparkles. Gorgeous."],
  'none': ["Time! Nothing finished. A tragedy in one act. Next time, darling.", "Not this round, sweetie. Even legends have off days."],
  'stopped': ["Challenge canceled. Fine. I'll pretend I wasn't excited.", "Show's off. For now."],
}

def js(o):
    return json.dumps(o, ensure_ascii=False, indent=1)

block = (
    "// MORE_LINES_START (generated by scripts/lines_more.py)\n"
    f"LINES.glitz = {js(GLITZ)};\n"
    f"const LINES_MORE = {js(MORE)};\n"
    "for (const [pid, keys] of Object.entries(LINES_MORE)) for (const [k, arr] of Object.entries(keys)) LINES[pid][k] = [...(LINES[pid][k] || []), ...arr];\n"
    "// MORE_LINES_END\n"
)
p = pathlib.Path(__file__).resolve().parent.parent / 'index.html'
s = p.read_text()
if '// MORE_LINES_START' in s:
    s = re.sub(r"// MORE_LINES_START.*?// MORE_LINES_END\n", lambda m: block, s, flags=re.S)
else:
    anchor = "function personaId(p = player())"
    s = s.replace(anchor, block + anchor, 1)
p.write_text(s)
print('lines written')
