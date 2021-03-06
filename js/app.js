/*legend for level plans:
  # are walls
  + are lava
  @ is player start point
  O chars are coins
  = are horizontal bouncy lava
  | vertical bouncy lava
  v drippy lava
  m monster that behaves like horizontal lava*/
  //Purpose of game: collect all coins without touching lava
let simpleLevelPlan = `
......................
..#................#..
..#..............=.#..
..#.........o.o....#..
..#.@......#####...#..
..#####............#..
......#++++++++++++#..
......##############..
......................`;

/*Declaring CLasses that will make up the game*/

class Level{
  constructor(plan){
    let rows = plan.trim().split('\n').map(l => [...l]);//trim() removes whitespace at start and end, split('\n') makes all lines directly below each other. Each line is spread into an array, which gives us arrays of characters
    this.height = rows.length;
    this.width = rows[0].length;
    this.startActors = [];//moving elements are actors.

    this.rows = rows.map((row,y) =>{
      return row.map((ch,x) =>{
        let type = levelChars[ch];
        if(typeof type == 'string') return type;
        this.startActors.push(type.create(new Vec(x,y), ch));
        return 'empty';
      });
    });
  }
}//end Level class that represents the map and things that can be in it
Level.prototype.touches = function(pos,size,type){
  var xStart = Math.floor(pos.x);
  var xEnd = Math.ceil(pos.x + size.x);
  var yStart = Math.floor(pos.y);
  var yEnd = Math.ceil(pos.y + size.y);

  for(var y = yStart; y < yEnd; y++){
    for(var x = xStart; x < xEnd; x++){
      let isOutside = x < 0 || x >= this.width || y < 0 || y >= this.height;
      let here = isOutside ? 'wall' : this.rows[y][x];
      if (here ==type){
        return true;
      }
    }
  }
  return false;
};



class State{
  constructor(level, actors, status, coins){
    this.level = level;
    this.actors = actors;
    this.status = status;//changes to lost or won when game ends
    this.coins = coins;
  }

  static start(level,startCoins){
    return new State(level, level.startActors, 'playing', startCoins);
  }//makes this a persistent data structure-updates create new states and leave the old one intact

  get player(){
    return this.actors.find(a => a.type == 'player');
  }// access only, no changing
}// end state class. contains level, actors, and status
State.prototype.update = function(time, keys){
  let actors = this.actors.map(actor => actor.update(time, this, keys));
  let newState = new State(this.level, actors, this.status, this.coins);

  if(newState.status != 'playing'){
    return newState;
  }

  let player = newState.player;
  if(this.level.touches(player.pos, player.size, 'lava')){
    return new State(this.level, actors, 'lost', this.coins);
  }

  for(let actor of actors){
    if( actor != player && overlap(actor, player)){
      newState = actor.collide(newState);
    }
  }
  return newState;
};

class Vec{
  constructor(x,y){
    this.x = x;
    this.y = y;
  }
  plus(other){
    return new Vec(this.x + other.x, this.y + other.y);
  }//persistent
  times(factor){
    return new Vec(this.x*factor, this.y*factor);
  }//persistent
}

//Actor Classes, since they behave pretty differently
const playerXSpeed = 7;
const gravity = 30;
const jumpSpeed = 17;
class Player{
  constructor(pos, speed){
    this.pos = pos;
    this.speed = speed;
  }

  get type(){
    return 'player';
  }

  static create(pos){
    return new Player(pos.plus(new Vec(0, -0.5)), new Vec(0,0));
  }
}
Player.prototype.size = new Vec(0.8, 1.5);//store the size on the prototype since size is the same for all instances of player
Player.prototype.update = function(time, state, keys){
  let xSpeed = 0;
  if(keys.ArrowLeft){
    xSpeed -= playerXSpeed;
  }
  if(keys.ArrowRight){
    xSpeed += playerXSpeed;
  }
  let pos = this.pos;
  let movedX = pos.plus(new Vec(xSpeed * time, 0));
  if(!state.level.touches(movedX, this.size, 'wall')){
    pos = movedX;
  }

  let ySpeed = this.speed.y + time * gravity;
  let movedY = pos.plus(new Vec(0, ySpeed * time));
  if(!state.level.touches(movedY, this.size, 'wall')){
    pos = movedY;
  } else if(keys.ArrowUp && ySpeed > 0){
    ySpeed = -jumpSpeed;
  } else {
    ySpeed = 0;
  }
  return new Player(pos,new Vec(xSpeed, ySpeed));
};

class Lava{
  constructor(pos, speed, reset){
    this.pos = pos;
    this.speed = speed;
    this.reset = reset;
  }

  get type(){return 'lava';}

  static create(pos, ch){
    if(ch == '='){
      return new Lava(pos, new Vec(2,0));
    } else if (ch == '|') {
      return new Lava(pos, new Vec(0,2));
    } else if (ch == 'v') {
      return new Lava(pos, new Vec(0,3), pos);
    } else if (ch == '+') {
      return new Lava(pos, new Vec(0,0));
    }
  }
}
Lava.prototype.size = new Vec(1,1);
Lava.prototype.collide = function(state){
  return new State(state.level, state.actors, 'lost', state.coins);
};
Lava.prototype.update = function(time, state){
  let newPos = this.pos.plus(this.speed.times(time));
  if(!state.level.touches(newPos, this.size, 'wall')){
    return new Lava(newPos, this.speed, this.reset);
  } else if(this.reset){//drippy lava has a reset
    return new Lava(this.reset, this.speed, this.reset);
  } else {
    return new Lava(this.pos, this.speed.times(-1));
  }//bouncy lava
};

class Monster{
  constructor(pos, speed){
    this.pos = pos;
    this.speed = speed;
  }

  get type(){return 'monster';}

  static create(pos){
    return new Monster(pos.plus(new Vec(0,-1)), new Vec(2,0));
  }

  update(time, state){
    let newPos = this.pos.plus(this.speed.times(time));
    if(!state.level.touches(newPos, this.size, 'wall')){
      return new Monster(newPos, this.speed);//didn't hit wall, so keeps going
    } else {
      return new Monster(this.pos, this.speed.times(-1));//hits wall so bounces back
    }
  }

  collide(state){
    let playerList = state.actors.filter(a => a.type == 'player');//returns an array
    let player = playerList[0];// is shallow copy of the actors list

    if(player.pos.y < this.pos.y){//lower y value is closer to "top"
      let filtered = state.actors.filter(a => a != this);//remove itself
      let bounceOff = new Vec(player.speed.x, (-1*player.speed.y));
      player.speed = bounceOff;
      return new State(state.level, filtered, 'playing', state.coins);
    }
    return new State(state.level, state.actors, 'lost', state.coins);
  }
}
Monster.prototype.size = new Vec(1.2, 2);

const wobbleSpeed = 8, wobbleDist = 0.07;
class Coin{
  constructor(pos, basePos, wobble){
    this.pos = pos;
    this.basePos = basePos;
    this.wobble = wobble;
  }

  get type(){return 'coin';}

  static create(pos){
    let basePos = pos.plus(new Vec(0.2, 0.1));
    return new Coin(basePos, basePos, Math.random()*Math.PI*2);
  }
}
Coin.prototype.size = new Vec(0.6, 0.6);
Coin.prototype.collide = function(state){
  state.coins+=1;
  document.getElementById('totalCoin').innerHTML = state.coins;
  let filtered = state.actors.filter(a => a != this);
  let status = state.status;
  if(!filtered.some(a => a.type == 'coin')){
    status = 'won';
  }
  return new State(state.level, filtered, status, state.coins);
};
Coin.prototype.update = function(time){
  let wobble = this.wobble + time * wobbleSpeed;
  let wobblePos = Math.sin(wobble) * wobbleDist;
  return new Coin(this.basePos.plus(new Vec(0, wobblePos)),this.basePos, wobble);
};

//object that maps plan characters to background grid or actor class
const levelChars = {
  '.': 'empty',
  '#': 'wall',
  '+': Lava,
  '@': Player,
  'o': Coin,
  '=': Lava,
  '|': Lava,
  'v': Lava,
  'm': Monster
};

/*--------Displaying everything--------------------*/

function elt(name, attrs, ...children){
  let dom = document.createElement(name);
  for(let attr of Object.keys(attrs)){
    dom.setAttribute(attr, attrs[attr]);
  }
  for(let child of children){
    dom.appendChild(child);
  }
  return dom;
}

/*DOMDisplay section*/
class DOMDisplay{
  constructor(parent, level){
    this.dom = elt('div', {class: 'game'}, drawGrid(level));//drawn once
    this.actorLayer = null;//holds actors for easy removal/replacement
    parent.appendChild(this.dom);
  }
  clear(){ this.dom.remove(); }
}

DOMDisplay.prototype.syncState = function(state){
  if(this.actorLayer){
    this.actorLayer.remove();
  }
  this.actorLayer = drawActors(state.actors);
  this.dom.appendChild(this.actorLayer);
  this.dom.className = `game ${state.status}`;
  this.scrollPlayerIntoView(state);
}

DOMDisplay.prototype.scrollPlayerIntoView = function(state){
  let width = this.dom.clientWidth;
  let height = this.dom.clientHeight;
  let margin = width/3;

  //the viewport
  let left = this.dom.scrollLeft, right = left + width;
  let top = this.dom.scrollTop, bottom = top + height;

  let player = state.player;
  let center = player.pos.plus(player.size.times(0.5)).times(scale);

  if(center.x < left + margin){
    this.dom.scrollLeft = center.x - margin;
  } else if (center.x > right - margin){
    this.dom.scrollLeft = center.x + margin - width;
  }//checks player isn't outside the width of box

  if(center.y < top + margin){
    this.dom.scrollTop = center.y - margin;
  } else if(center.y > bottom - margin){
    this.dom.scrollTop = center.y + margin - height;
  }//checks player isn't outside the height of box
};

var scale = 20;

function drawGrid(level){
  return elt('table', {
    class: 'background',
    style: `width: ${level.width*scale}px`
  }, ...level.rows.map(row =>
  elt('tr', {style: `height: ${scale}px`},
  ...row.map(type => elt('td', {class: type})))));
}//background is drawn as <table> element so there are rows
// the spread(triple dot) operator is used to pass arrays of child nodes to elt as separate arguments.

//draw actors

function drawActors(actors){
  return elt('div', {}, ...actors.map(actor => {
    let rect = elt('div', {class: `actor ${actor.type}`});
    rect.style.width = `${actor.size.x * scale}px`;
    rect.style.height = `${actor.size.y * scale}px`;
    rect.style.left = `${actor.pos.x * scale}px`;
    rect.style.top = `${actor.pos.y * scale}px`;
    return rect;
  }));
}

/*---------Movement and interaction functions------------*/
//check overlap
function overlap(actor1, actor2){
  return actor1.pos.x + actor1.size.x > actor2.pos.x && actor1.pos.x < actor2.pos.x + actor2.size.x && actor1.pos.y + actor1.size.y > actor2.pos.y && actor1.pos.y < actor2.pos.y + actor2.size.y;
}

//tracking keys
function trackKeys(keys){
  let down = Object.create(null);
  function track(event){
    if(keys.includes(event.key)){
      down[event.key] = event.type == 'keydown';
      event.preventDefault();
    }
  }
  window.addEventListener('keydown', track);
  window.addEventListener('keyup', track);
  return down;
}

const arrowKeys = trackKeys(['ArrowLeft', 'ArrowRight', 'ArrowUp']);

//Running the game with a helper function
function runAnimation(frameFunc){
  let lastTime = null;
  function frame(time){
    if(lastTime != null){
      let timeStep = Math.min(time - lastTime, 100)/ 1000;
      if(frameFunc(timeStep) === false){
        return;
      }
    }
    lastTime = time;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function runLevel(level, Display){
  let display = new Display(document.body, level);
  let state = State.start(level,0);//0 is how many coins you start with
  let ending = 1;
  return new Promise(resolve => {
    runAnimation(time => {
      state = state.update(time, arrowKeys);
      display.syncState(state);
      if (state.status == 'playing'){
        return true;
      } else if(ending > 0){
        ending -= time;
        return true;
      } else {
        display.clear();
        resolve(state.status);
        return false;
      }
    });//end call to runAnimation
  });//end promise
}



async function runGame(plans, Display){
  let playerHP = document.getElementById('hp');
  let level = 0;
  let playerLife = 3;
  playerHP.innerHTML = playerLife;
  //while starts the game
  while(level < plans.length){
    let status = await runLevel(new Level(plans[level]), Display);
    if(status == 'won'){
      level++;
      document.getElementById('totalCoin').innerHTML = 0;//reset your coin count immediately
    } else if(status == 'lost'){
      playerLife -= 1;
      playerHP.innerHTML = playerLife;
      document.getElementById('totalCoin').innerHTML = 0;//reset your coin count immediately
      if(playerLife == 0){
        console.log("Last chance!");
      }
    }
    if(playerLife < 0){
      console.log("You've lost...");
      break;
    }
  }
  if(status == 'won'){
    console.log("You've won!");
  }
}
