# cursor creatures

Twenty-nine things that live in your cursor. A skeleton lizard, a fire dragon, 300 fish, a spider, a snake, centipedes, an octopus, a T-rex, a stack of ravens, skeleton hands, a chameleon, jellyfish, moths, a hydra, a scorpion, a cat, an electric eel, a mantis shrimp, a crocodile, piranhas, an owl, a hermit crab, a shark, a raptor, a pistol shrimp, a spitting cobra, a komodo dragon, a moray eel and murder hornets.

Plain JavaScript and canvas. No libraries, no build step.

![lizard](thumbs/lizard.jpg)

## the creatures

| | | |
|---|---|---|
| ![lizard](thumbs/lizard.jpg) **lizard**<br>click to feed it. once it's full, stop moving and it eats your cursor | ![dragon](thumbs/dragon.jpg) **dragon**<br>click or hold to breathe fire. it burns the headline, then your cursor | ![fish](thumbs/fish.jpg) **fish**<br>click to scatter, hold for a giant arrow, double click for one big fish |
| ![spider](thumbs/spider.jpg) **spider**<br>click to make it spin a web, then fly your cursor into it | ![snake](thumbs/snake.jpg) **snake**<br>stop moving and it strikes. click and it bites its own tail | ![centipede](thumbs/centipede.jpg) **centipede**<br>every click splits it in half. at eight they merge into a giant |
| ![octopus](thumbs/octopus.jpg) **octopus**<br>steals letters, throws them when you click, hides when you stand still | ![trex](thumbs/trex.jpg) **t-rex**<br>roars at your cursor, jumps for it, trips over its own tail | ![ravens](thumbs/raven.jpg) **ravens**<br>hold still and one perches on the cursor. click for more. careful |
| ![hands](thumbs/hands.jpg) **hands**<br>skeleton arms reach up out of the ground. fly too low and they drag you under | ![chameleon](thumbs/chameleon.jpg) **chameleon**<br>its eyes track you separately. hold still and the tongue comes out | ![jellies](thumbs/jelly.jpg) **jellies**<br>click to add one. stop moving and they surround you and sting |
| ![moths](thumbs/moths.jpg) **moths**<br>they think your cursor is a lamp. click to switch it off and see what's out there | ![hydra](thumbs/hydra.jpg) **hydra**<br>click to cut off a head and two grow back. stop at some point | ![scorpion](thumbs/scorpion.jpg) **scorpion**<br>click and it stings. hold still and it grabs the cursor and stings it properly |
| ![cat](thumbs/cat.jpg) **cat**<br>chases you, stalks you when you stop, pounces. catch it and it curls up and purrs | ![eel](thumbs/eel.jpg) **eel**<br>charges up as it swims. click for a bolt. let it hit 99 volts and the lights go out | ![mantis shrimp](thumbs/mantis.jpg) **mantis shrimp**<br>every punch cracks the screen. hold still in front of it and it breaks the glass |
| ![crocodile](thumbs/croc.jpg) **crocodile**<br>lurks with its eyes up. first bite takes the tail, the second is the death roll (the screen rolls too) | ![piranhas](thumbs/piranha.jpg) **piranhas**<br>bites chunks out of the cursor. friends turn up, then a frenzy strips it to the bone | ![owl](thumbs/owl.jpg) **owl**<br>its head always points at the cursor. circle it until the neck unwinds like a propeller |
| ![hermit crab](thumbs/crab.jpg) **hermit crab**<br>click a letter and it tries it on. hold still and it moves into your cursor | ![shark](thumbs/shark.jpg) **shark**<br>the page floods. get too close to the water and it lunges. let it rise and it breaches | ![raptor](thumbs/raptor.jpg) **raptor**<br>hold still and it takes your cursor: selects, drags, deletes, closes the window |
| ![pistol shrimp](thumbs/pistol.jpg) **pistol shrimp**<br>snaps a bubble louder than a gunshot. hold still and the big one blows the page away | ![spitting cobra](thumbs/cobra.jpg) **spitting cobra**<br>spits venom on your screen. click for the wipers. hold still and it aims for your eyes | ![komodo dragon](thumbs/komodo.jpg) **komodo dragon**<br>one bite and your cursor lags, slower and slower, until it swallows it |
| ![moray eel](thumbs/moray.jpg) **moray eel**<br>lunges when you get inside the ring. stay outside and the second jaws come out | ![murder hornet](thumbs/hornet.jpg) **murder hornet**<br>every sting swells the cursor. four stings in, the nest turns up. then it pops |  |

## running it

It's all static files, but the scripts are ES modules so you need a local server (opening the html file directly won't work).

```
npx serve .
# or
python3 -m http.server
```

Then open http://localhost:3000 (or :8000 for python).

Add `?clean` to any creature's url to hide the text in the corners. Useful for screen recording.

## how they work

Most of them are built from the same three ideas.

**Follow the leader.** A spine is a list of points. The head moves towards the cursor and every other point gets dragged along so it stays a fixed distance behind the one in front. Clamp how far each joint can bend and you get something that slithers instead of folding in half. That's `followChain` in `src/kit/math.js`.

**Feet that stay planted.** Each foot has a rest spot relative to the body. It stays exactly where it is until the body has moved far enough that the rest spot is too far away, then it steps over. Legs on opposite sides take turns. This is what makes them look like they're walking rather than sliding.

**Two bone IK.** Given a hip and a foot, there's only one place the knee can go (well, two, pick the one that bends the right way). `ik2` does the maths.

Everything runs on a fixed 120 steps per second so it behaves the same on a 60hz laptop and a 144hz monitor.

```
src/
  kit/
    math.js     chains, ik, easing, small helpers
    body.js     vectors, steering, a gait for lots of legs (the newer creatures use it)
    stage.js    canvases, mouse tracking, the loop, the corner text
  creatures/    one file per creature
  style.css
lizard/ dragon/ ...   one page each
```

## license

MIT
