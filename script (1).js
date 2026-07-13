(function () {
  var container = document.getElementById('game-container');
  var holder = document.getElementById('canvas-holder');
  var overlay = document.getElementById('overlay');
  var hotbarEl = document.getElementById('hotbar');

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0x87CEEB, 25, 60);

  var camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.1, 1000);
  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  holder.appendChild(renderer.domElement);

  window.addEventListener('resize', function () {
    var w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

  var hemi = new THREE.HemisphereLight(0xffffff, 0x556644, 0.9);
  scene.add(hemi);
  var sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(30, 50, 20);
  scene.add(sun);

  var SIZE = 18;
  var colors = {
    grass: 0x4caf50,
    dirt: 0x8b5a2b,
    stone: 0x9e9e9e,
    wood: 0xa0714a,
    sand: 0xe0c777
  };
  var palette = ['grass', 'dirt', 'stone', 'wood', 'sand'];
  var selected = 0;

  function heightAt(x, z) {
    return Math.floor(3 + 2 * Math.sin(x / 4.5) + 1.5 * Math.cos(z / 5.5) + Math.sin((x + z) / 6));
  }

  var blocks = new Map();
  function key(x, y, z) { return x + ',' + y + ',' + z; }

  for (var x = -SIZE; x <= SIZE; x++) {
    for (var z = -SIZE; z <= SIZE; z++) {
      var h = heightAt(x, z);
      for (var y = 0; y <= h; y++) {
        var type = 'stone';
        if (y === h) type = 'grass';
        else if (y >= h - 2) type = 'dirt';
        blocks.set(key(x, y, z), type);
      }
    }
  }

  var boxGeo = new THREE.BoxGeometry(1, 1, 1);
  var meshes = {};
  var instanceMaps = {};

  function rebuildMeshes() {
    for (var k in meshes) {
      scene.remove(meshes[k]);
      meshes[k].geometry.dispose();
    }
    meshes = {};
    instanceMaps = {};

    var grouped = {};
    blocks.forEach(function (type, k) {
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(k);
    });

    for (var type in grouped) {
      var keys = grouped[type];
      var mat = new THREE.MeshLambertMaterial({ color: colors[type] });
      var mesh = new THREE.InstancedMesh(boxGeo, mat, keys.length);
      var dummy = new THREE.Object3D();
      var map = [];
      for (var i = 0; i < keys.length; i++) {
        var parts = keys[i].split(',').map(Number);
        dummy.position.set(parts[0] + 0.5, parts[1] + 0.5, parts[2] + 0.5);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        map.push(parts);
      }
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
      meshes[type] = mesh;
      instanceMaps[type] = map;
    }
  }
  rebuildMeshes();

  var spawnH = heightAt(0, 0);
  var player = { x: 0, y: spawnH + 2.6, z: 0, yaw: 0, pitch: 0 };
  camera.position.set(player.x, player.y, player.z);

  var keysDown = {};
  var locked = false;

  function requestLock() {
    var el = renderer.domElement;
    var fn = el.requestPointerLock || el.mozRequestPointerLock;
    if (fn) fn.call(el);
  }
  container.addEventListener('click', function () {
    if (!locked) requestLock();
  });

  document.addEventListener('pointerlockchange', function () {
    locked = (document.pointerLockElement === renderer.domElement);
    overlay.style.display = locked ? 'none' : 'flex';
  });

  document.addEventListener('mousemove', function (e) {
    if (!locked) return;
    player.yaw -= e.movementX * 0.0022;
    player.pitch -= e.movementY * 0.0022;
    var lim = Math.PI / 2 - 0.05;
    if (player.pitch > lim) player.pitch = lim;
    if (player.pitch < -lim) player.pitch = -lim;
  });

  window.addEventListener('keydown', function (e) {
    keysDown[e.key.toLowerCase()] = true;
    var n = parseInt(e.key);
    if (n >= 1 && n <= 5) {
      selected = n - 1;
      updateHotbar();
    }
  });
  window.addEventListener('keyup', function (e) {
    keysDown[e.key.toLowerCase()] = false;
  });

  var raycaster = new THREE.Raycaster();

  function getLookedBlock() {
    raycaster.set(camera.position, camera.getWorldDirection(new THREE.Vector3()));
    var hitList = [];
    for (var type in meshes) {
      var hits = raycaster.intersectObject(meshes[type]);
      for (var i = 0; i < hits.length; i++) {
        if (hits[i].distance < 7) {
          hitList.push({
            dist: hits[i].distance,
            type: type,
            instanceId: hits[i].instanceId,
            face: hits[i].face
          });
        }
      }
    }
    if (!hitList.length) return null;
    hitList.sort(function (a, b) { return a.dist - b.dist; });
    return hitList[0];
  }

  renderer.domElement.addEventListener('mousedown', function (e) {
    if (!locked) return;
    var hit = getLookedBlock();
    if (!hit) return;
    var pos = instanceMaps[hit.type][hit.instanceId];

    if (e.button === 0) {
      blocks.delete(key(pos[0], pos[1], pos[2]));
      rebuildMeshes();
    } else if (e.button === 2) {
      var n = hit.face.normal;
      var nx = pos[0] + Math.round(n.x);
      var ny = pos[1] + Math.round(n.y);
      var nz = pos[2] + Math.round(n.z);
      if (!blocks.has(key(nx, ny, nz))) {
        blocks.set(key(nx, ny, nz), palette[selected]);
        rebuildMeshes();
      }
    }
  });
  renderer.domElement.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });

  function updateHotbar() {
    hotbarEl.innerHTML = '';
    palette.forEach(function (type, i) {
      var sw = document.createElement('div');
      sw.className = 'hotbar-slot' + (i === selected ? ' active' : '');
      sw.style.background = '#' + colors[type].toString(16).padStart(6, '0');
      hotbarEl.appendChild(sw);
    });
  }
  updateHotbar();

  var PLAYER_RADIUS = 0.3;
  var EYE_TO_FEET = 1.6;
  var EYE_TO_HEAD = 0.2;

  function collides(px, py, pz) {
    var corners = [
      [-PLAYER_RADIUS, -PLAYER_RADIUS],
      [-PLAYER_RADIUS, PLAYER_RADIUS],
      [PLAYER_RADIUS, -PLAYER_RADIUS],
      [PLAYER_RADIUS, PLAYER_RADIUS]
    ];
    var heights = [py - EYE_TO_FEET, py + EYE_TO_HEAD];
    for (var i = 0; i < corners.length; i++) {
      var dx = corners[i][0], dz = corners[i][1];
      for (var j = 0; j < heights.length; j++) {
        var bx = Math.floor(px + dx);
        var by = Math.floor(heights[j]);
        var bz = Math.floor(pz + dz);
        if (blocks.has(key(bx, by, bz))) return true;
      }
    }
    return false;
  }

  var clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    var dt = Math.min(clock.getDelta(), 0.05);

    if (locked) {
      var speed = 6 * dt;
      var forward = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw)).multiplyScalar(-1);
      var right = new THREE.Vector3(-forward.z, 0, forward.x);
      var move = new THREE.Vector3();
      if (keysDown['w']) move.add(forward);
      if (keysDown['s']) move.sub(forward);
      if (keysDown['a']) move.sub(right);
      if (keysDown['d']) move.add(right);
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(speed);
        var newX = player.x + move.x;
        if (!collides(newX, player.y, player.z)) player.x = newX;
        var newZ = player.z + move.z;
        if (!collides(player.x, player.y, newZ)) player.z = newZ;
      }
      if (keysDown[' ']) {
        var upY = player.y + speed;
        if (!collides(player.x, upY, player.z)) player.y = upY;
      }
      if (keysDown['shift']) {
        var downY = player.y - speed;
        if (!collides(player.x, downY, player.z)) player.y = downY;
      }
    }

    camera.position.set(player.x, player.y, player.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;

    renderer.render(scene, camera);
  }
  animate();
})();
