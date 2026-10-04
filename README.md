# cursor creatures

Things that live in your cursor. A skeleton lizard, a fire dragon, 300 fish, a spider, a snake, centipedes, an octopus, a T-rex and a stack of ravens.

Plain JavaScript and canvas. No libraries, no build step.

![lizard](thumbs/lizard.jpg)

## the creatures

| | | |
|---|---|---|
| ![lizard](thumbs/lizard.jpg) **lizard**<br>click to feed it. once it's full, stop moving and it eats your cursor | ![dragon](thumbs/dragon.jpg) **dragon**<br>click or hold to breathe fire. it burns the headline, then your cursor | ![fish](thumbs/fish.jpg) **fish**<br>click to scatter, hold for a giant arrow, double click for one big fish |
| ![spider](thumbs/spider.jpg) **spider**<br>click to make it spin a web, then fly your cursor into it | ![snake](thumbs/snake.jpg) **snake**<br>stop moving and it strikes. click and it bites its own tail | ![centipede](thumbs/centipede.jpg) **centipede**<br>every click splits it in half. at eight they merge into a giant |
| ![octopus](thumbs/octopus.jpg) **octopus**<br>steals letters, throws them when you click, hides when you stand still | ![trex](thumbs/trex.jpg) **t-rex**<br>roars at your cursor, jumps for it, trips over its own tail | ![ravens](thumbs/raven.jpg) **ravens**<br>hold still and one perches on the cursor. click for more. careful |

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
    stage.js    canvases, mouse tracking, the loop, the corner text
  creatures/    one file per creature
  style.css
lizard/ dragon/ ...   one page each
```

## license

MIT
