// Three.js 씬 설정
// =========================================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xfef3e7, 20, 60);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 100);
let cameraAngle = Math.PI / 4;
let cameraPitch = Math.PI / 3.5;
let cameraDist = 30;
const cameraTarget = new THREE.Vector3(0, 0, 0);

function updateCamera() {
  camera.position.x = cameraTarget.x + Math.sin(cameraAngle) * Math.sin(cameraPitch) * cameraDist;
  camera.position.z = cameraTarget.z + Math.cos(cameraAngle) * Math.sin(cameraPitch) * cameraDist;
  camera.position.y = cameraTarget.y + Math.cos(cameraPitch) * cameraDist;
  camera.lookAt(cameraTarget);
}
updateCamera();

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// 조명
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
sunLight.position.set(10, 20, 5);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 1024;
sunLight.shadow.mapSize.height = 1024;
sunLight.shadow.camera.left = -20;
sunLight.shadow.camera.right = 20;
sunLight.shadow.camera.top = 20;
sunLight.shadow.camera.bottom = -20;
scene.add(sunLight);

// 지면 (잔디)
const groundGeo = new THREE.CircleGeometry(20, 48);
const groundMat = new THREE.MeshStandardMaterial({ color: 0xa8dcc3 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI/2;
ground.receiveShadow = true;
scene.add(ground);

// 길
const pathMat = new THREE.MeshStandardMaterial({ color: 0xf0e4d4 });
LOCATIONS.slice(1).forEach(loc => {
  const pathGeo = new THREE.PlaneGeometry(1.2, Math.hypot(loc.x, loc.z));
  const path = new THREE.Mesh(pathGeo, pathMat);
  path.rotation.x = -Math.PI/2;
  path.position.set(loc.x/2, 0.01, loc.z/2);
  path.rotation.z = Math.atan2(loc.x, loc.z);
  path.receiveShadow = true;
  scene.add(path);
});

// 광장 바닥
const plazaGeo = new THREE.CircleGeometry(2.5, 32);
const plaza = new THREE.Mesh(plazaGeo, new THREE.MeshStandardMaterial({ color: 0xfff0cc }));
plaza.rotation.x = -Math.PI/2;
plaza.position.y = 0.02;
plaza.receiveShadow = true;
scene.add(plaza);

// 건물 생성
const buildings = [];
LOCATIONS.slice(1, 5).forEach((loc, i) => {
  const group = new THREE.Group();
  // 본체
  const bodyGeo = new THREE.BoxGeometry(3, 2.2, 3);
  const bodyMat = new THREE.MeshStandardMaterial({ color: loc.color });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 1.1;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  // 지붕
  const roofGeo = new THREE.ConeGeometry(2.3, 1.3, 4);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xe89880 });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 2.85;
  roof.rotation.y = Math.PI/4;
  roof.castShadow = true;
  group.add(roof);
  // 창문 (노란 네모) - 밤에 빛남
  const windowMat = new THREE.MeshStandardMaterial({ color: 0xfff0cc, emissive: 0x000000 });
  const winGeo = new THREE.PlaneGeometry(0.5, 0.5);
  for (let j = -1; j <= 1; j += 2) {
    const win = new THREE.Mesh(winGeo, windowMat);
    win.position.set(j * 0.8, 1.2, 1.51);
    group.add(win);
  }
  // 문 (건물 정면 중앙, 광장을 향한 쪽)
  // 건물 중심(loc.x, loc.z)과 문 좌표(loc.door)의 차이로 방향 판단
  if (loc.door) {
    const doorDx = loc.door.x - loc.x;
    const doorDz = loc.door.z - loc.z;
    // 문 프레임 (어두운 색)
    const doorFrameGeo = new THREE.PlaneGeometry(0.9, 1.6);
    const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0x5a3a2a });
    const doorFrame = new THREE.Mesh(doorFrameGeo, doorFrameMat);
    // 문은 건물 외벽에 붙어있어야 함 — 광장 방향 면에
    if (Math.abs(doorDz) > Math.abs(doorDx)) {
      // 문이 남/북쪽
      doorFrame.position.set(0, 0.8, doorDz > 0 ? 1.51 : -1.51);
      if (doorDz < 0) doorFrame.rotation.y = Math.PI;
    } else {
      // 문이 동/서쪽
      doorFrame.position.set(doorDx > 0 ? 1.51 : -1.51, 0.8, 0);
      doorFrame.rotation.y = doorDx > 0 ? Math.PI/2 : -Math.PI/2;
    }
    group.add(doorFrame);
    // 문 손잡이 (작은 황금색 구)
    const knobGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const knobMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, emissive: 0x332200 });
    const knob = new THREE.Mesh(knobGeo, knobMat);
    const knobOffset = 0.25;
    if (Math.abs(doorDz) > Math.abs(doorDx)) {
      knob.position.set(knobOffset, 0.85, doorDz > 0 ? 1.53 : -1.53);
    } else {
      knob.position.set(doorDx > 0 ? 1.53 : -1.53, 0.85, knobOffset);
    }
    group.add(knob);
  }
  // 간판 이모지 대신 색칠된 깃발
  const flagGeo = new THREE.BoxGeometry(0.1, 1.5, 0.1);
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: 0x8b5a2b }));
  flag.position.set(1.2, 2.5, 1.2);
  group.add(flag);
  
  group.position.set(loc.x, 0, loc.z);
  group.userData = { type: 'building', name: loc.name, windowMat, loc };
  scene.add(group);
  buildings.push(group);
});

// =========================================================
// 유저의 집 (북쪽 외곽)
// =========================================================
(function buildUserHouseExterior() {
  const homeLoc = LOCATIONS.find(l => l.name === '우리집');
  if (!homeLoc) return;
  const group = new THREE.Group();
  
  // 본체 — 일반 상점보다 살짝 작고 따뜻한 크림색
  const bodyGeo = new THREE.BoxGeometry(3.4, 2.4, 3.4);
  const bodyMat = new THREE.MeshStandardMaterial({ color: homeLoc.color });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 1.2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  
  // 지붕 — 경사 지붕 (삼각기둥 형태)
  const roofGeo = new THREE.ConeGeometry(2.6, 1.6, 4);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xc77548 }); // 주황빛 기와
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 3.2;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);
  
  // 현관문 (갈색)
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x6b4423 });
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.4), doorMat);
  door.position.set(0, 0.7, 1.71);
  group.add(door);
  // 문손잡이 (금색 점)
  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xd4af37, emissive: 0x3a2a0a })
  );
  knob.position.set(0.25, 0.7, 1.73);
  group.add(knob);
  
  // 창문 2개 (앞면, 밤에 빛남) — 창틀을 살짝 뒤에 두고 창문은 앞쪽
  const windowMat = new THREE.MeshStandardMaterial({ color: 0xfff0cc, emissive: 0x000000 });
  for (const x of [-1.1, 1.1]) {
    // 창틀 (흰색, 뒤쪽)
    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(0.85, 0.85),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    frame.position.set(x, 1.5, 1.705);
    group.add(frame);
    // 창문 (앞쪽, 발광)
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.65), windowMat);
    win.position.set(x, 1.5, 1.72);
    group.add(win);
  }
  
  // 굴뚝 (옆면 위쪽)
  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 1.0, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x8b5a3c })
  );
  chimney.position.set(-0.9, 3.3, -0.3);
  chimney.castShadow = true;
  group.add(chimney);
  
  // 작은 팻말 ("우리집")
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.35, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xf5e8d0 })
  );
  sign.position.set(0, 1.8, 1.73);
  group.add(sign);
  
  group.position.set(homeLoc.x, 0, homeLoc.z);
  group.userData = { type: 'building', name: homeLoc.name, windowMat, loc: homeLoc, isHome: true };
  scene.add(group);
  buildings.push(group);
})();

// 연못
const pondLoc = LOCATIONS[5];
const pondGeo = new THREE.CircleGeometry(2.2, 32);
const pondMat = new THREE.MeshStandardMaterial({ color: 0xa8d0dc, transparent: true, opacity: 0.85 });
const pond = new THREE.Mesh(pondGeo, pondMat);
pond.rotation.x = -Math.PI/2;
pond.position.set(pondLoc.x, 0.05, pondLoc.z);
scene.add(pond);

// 나무
// 충돌용 장애물 리스트 (원형 — x, z, radius)
const obstacles = [];

function createTree(x, z) {
  const tree = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 1.2, 8);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 0.6;
  trunk.castShadow = true;
  tree.add(trunk);
  const leavesGeo = new THREE.SphereGeometry(1.1, 12, 12);
  const leavesMat = new THREE.MeshStandardMaterial({ color: 0x6bb585 });
  const leaves = new THREE.Mesh(leavesGeo, leavesMat);
  leaves.position.y = 1.7;
  leaves.castShadow = true;
  tree.add(leaves);
  tree.position.set(x, 0, z);
  return tree;
}
for (let i = 0; i < 18; i++) {
  const a = (i / 18) * Math.PI * 2;
  const r = 13 + Math.random() * 5;
  const tx = Math.cos(a) * r;
  const tz = Math.sin(a) * r;
  const t = createTree(tx, tz);
  scene.add(t);
  obstacles.push({ x: tx, z: tz, radius: 0.7, type: 'tree' });
}
// 산재된 작은 나무
for (let i = 0; i < 8; i++) {
  const x = (Math.random() - 0.5) * 18;
  const z = (Math.random() - 0.5) * 18;
  if (Math.hypot(x, z) > 3 && LOCATIONS.every(l => Math.hypot(l.x-x, l.z-z) > 3)) {
    const t = createTree(x, z);
    const scale = 0.6 + Math.random() * 0.3;
    t.scale.setScalar(scale);
    scene.add(t);
    obstacles.push({ x, z, radius: 0.55 * scale, type: 'tree' });
  }
}

// 건물들을 장애물에 추가 (크기: 3x3 정방형 → 반경 1.8 근사)
for (const loc of LOCATIONS) {
  if (loc.interior) {
    // 유저 집은 반경 조금 더 큼 (3.4 사이즈)
    const radius = loc.name === '우리집' ? 2.0 : 1.8;
    obstacles.push({ x: loc.x, z: loc.z, radius, type: 'building', loc });
  }
}
// 연못도 장애물 (건너기 금지)
const pondLocObstacle = LOCATIONS.find(l => l.name === '연못');
if (pondLocObstacle) {
  obstacles.push({ x: pondLocObstacle.x, z: pondLocObstacle.z, radius: 2.4, type: 'pond' });
}

// 꽃
for (let i = 0; i < 30; i++) {
  const x = (Math.random() - 0.5) * 28;
  const z = (Math.random() - 0.5) * 28;
  if (Math.hypot(x, z) < 19 && Math.hypot(x, z) > 3) {
    const flowerColors = [0xff9ebb, 0xffd580, 0xc9b2f5, 0xfad4d8];
    const flower = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 6, 6),
      new THREE.MeshStandardMaterial({ color: flowerColors[i % flowerColors.length] })
    );
    flower.position.set(x, 0.18, z);
    scene.add(flower);
  }
}

// =========================================================
// NPC 3D 아바타
// =========================================================
function createNpcMesh(animal) {
  const group = new THREE.Group();
  // 몸통
  const bodyGeo = new THREE.SphereGeometry(0.45, 16, 12);
  const bodyMat = new THREE.MeshStandardMaterial({ color: animal.color });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.55;
  body.scale.y = 1.1;
  body.castShadow = true;
  group.add(body);
  // 머리
  const headGeo = new THREE.SphereGeometry(0.4, 16, 12);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.y = 1.3;
  head.castShadow = true;
  group.add(head);
  // 눈
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
  const eyeGeo = new THREE.SphereGeometry(0.06, 8, 8);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.15, 1.35, 0.35);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.15, 1.35, 0.35);
  group.add(eyeL); group.add(eyeR);
  // 볼 홍조
  const cheekMat = new THREE.MeshStandardMaterial({ color: 0xff9ebb, transparent: true, opacity: 0.5 });
  const cheekGeo = new THREE.SphereGeometry(0.08, 8, 8);
  const cheekL = new THREE.Mesh(cheekGeo, cheekMat);
  cheekL.position.set(-0.25, 1.2, 0.3);
  const cheekR = new THREE.Mesh(cheekGeo, cheekMat);
  cheekR.position.set(0.25, 1.2, 0.3);
  group.add(cheekL); group.add(cheekR);
  // 귀/뿔 (종족별 헤더 마커)
  if (animal.species === '토끼') {
    const earGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.5, 8);
    const earL = new THREE.Mesh(earGeo, bodyMat);
    earL.position.set(-0.12, 1.75, 0);
    earL.rotation.z = 0.1;
    const earR = new THREE.Mesh(earGeo, bodyMat);
    earR.position.set(0.12, 1.75, 0);
    earR.rotation.z = -0.1;
    group.add(earL); group.add(earR);
  } else if (animal.species === '고양이') {
    const earGeo = new THREE.ConeGeometry(0.12, 0.25, 4);
    const earL = new THREE.Mesh(earGeo, bodyMat);
    earL.position.set(-0.2, 1.65, 0);
    const earR = new THREE.Mesh(earGeo, bodyMat);
    earR.position.set(0.2, 1.65, 0);
    group.add(earL); group.add(earR);
  } else if (animal.species === '부엉이') {
    const tuftGeo = new THREE.ConeGeometry(0.08, 0.2, 4);
    const tuftL = new THREE.Mesh(tuftGeo, bodyMat);
    tuftL.position.set(-0.18, 1.7, 0);
    const tuftR = new THREE.Mesh(tuftGeo, bodyMat);
    tuftR.position.set(0.18, 1.7, 0);
    group.add(tuftL); group.add(tuftR);
  } else if (animal.species === '앵무새') {
    const crestGeo = new THREE.ConeGeometry(0.15, 0.35, 6);
    const crest = new THREE.Mesh(crestGeo, new THREE.MeshStandardMaterial({ color: 0xff7a9c }));
    crest.position.set(0, 1.8, 0);
    group.add(crest);
    // 부리
    const beakGeo = new THREE.ConeGeometry(0.08, 0.2, 4);
    const beak = new THREE.Mesh(beakGeo, new THREE.MeshStandardMaterial({ color: 0xffa76b }));
    beak.position.set(0, 1.28, 0.4);
    beak.rotation.x = Math.PI/2;
    group.add(beak);
  } else if (animal.species === '거북이') {
    // 등껍질
    const shellGeo = new THREE.SphereGeometry(0.5, 16, 12, 0, Math.PI * 2, 0, Math.PI/2);
    const shellMat = new THREE.MeshStandardMaterial({ color: 0x6bb585 });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.position.y = 0.7;
    shell.castShadow = true;
    group.add(shell);
  }
  return group;
}

// =========================================================
// 유저 아바타 (사람)
// =========================================================
function createUserMesh() {
  const group = new THREE.Group();
  // 동물 NPC보다 살짝 큼 (동물은 ~1.7 높이, 유저는 ~2.0 높이)
  const skinColor = 0xffd9b3;    // 피부톤
  const hairColor = 0x3a2a1a;    // 머리카락 짙은 갈색
  const shirtColor = 0x7ab8e8;   // 파스텔 블루 셔츠
  const pantsColor = 0x6b4423;   // 갈색 바지
  const shoeColor = 0x2a1a10;    // 어두운 신발

  // 다리 (2개)
  const legGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.6, 10);
  const legMat = new THREE.MeshStandardMaterial({ color: pantsColor });
  for (const x of [-0.13, 0.13]) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(x, 0.3, 0);
    leg.castShadow = true;
    group.add(leg);
    // 신발
    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.1, 0.28),
      new THREE.MeshStandardMaterial({ color: shoeColor })
    );
    shoe.position.set(x, 0.05, 0.04);
    shoe.castShadow = true;
    group.add(shoe);
  }

  // 몸통 (셔츠)
  const torsoGeo = new THREE.CylinderGeometry(0.28, 0.23, 0.7, 12);
  const torso = new THREE.Mesh(torsoGeo, new THREE.MeshStandardMaterial({ color: shirtColor }));
  torso.position.y = 0.95;
  torso.castShadow = true;
  group.add(torso);

  // 팔 (2개, 셔츠 색상)
  const armGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.55, 8);
  const armMat = new THREE.MeshStandardMaterial({ color: shirtColor });
  for (const x of [-0.32, 0.32]) {
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.position.set(x, 0.95, 0);
    arm.castShadow = true;
    group.add(arm);
    // 손 (피부톤)
    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 8),
      new THREE.MeshStandardMaterial({ color: skinColor })
    );
    hand.position.set(x, 0.65, 0);
    hand.castShadow = true;
    group.add(hand);
  }

  // 목
  const neckGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.1, 8);
  const neck = new THREE.Mesh(neckGeo, new THREE.MeshStandardMaterial({ color: skinColor }));
  neck.position.y = 1.35;
  group.add(neck);

  // 머리 (둥글둥글하게)
  const headGeo = new THREE.SphereGeometry(0.3, 16, 14);
  const head = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: skinColor }));
  head.position.y = 1.65;
  head.castShadow = true;
  group.add(head);

  // 머리카락 (머리 뒤쪽 + 위쪽 덮기)
  const hairGeo = new THREE.SphereGeometry(0.32, 16, 14, 0, Math.PI * 2, 0, Math.PI / 1.7);
  const hair = new THREE.Mesh(hairGeo, new THREE.MeshStandardMaterial({ color: hairColor }));
  hair.position.y = 1.68;
  hair.castShadow = true;
  group.add(hair);

  // 눈 (검은 점 2개)
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
  const eyeGeo = new THREE.SphereGeometry(0.035, 8, 8);
  for (const x of [-0.1, 0.1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(x, 1.68, 0.27);
    group.add(eye);
  }

  // 입 (작은 선)
  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.012, 0.01),
    new THREE.MeshStandardMaterial({ color: 0x8b4a3a })
  );
  mouth.position.set(0, 1.56, 0.29);
  group.add(mouth);

  // 볼 홍조 (NPC들과 톤 맞춤)
  const cheekMat = new THREE.MeshStandardMaterial({ color: 0xff9ebb, transparent: true, opacity: 0.5 });
  const cheekGeo = new THREE.SphereGeometry(0.05, 8, 8);
  for (const x of [-0.18, 0.18]) {
    const cheek = new THREE.Mesh(cheekGeo, cheekMat);
    cheek.position.set(x, 1.6, 0.22);
    group.add(cheek);
  }

  return group;
}

// =========================================================
// 목적지 마커 (원형 바운드, 펄스 애니메이션)
// =========================================================
let destinationMarker = null;

function createDestinationMarker() {
  const group = new THREE.Group();
  // 바깥 링 (펄스)
  const outerRing = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.7, 32),
    new THREE.MeshBasicMaterial({ color: 0xf4b6c1, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
  );
  outerRing.rotation.x = -Math.PI / 2;
  group.add(outerRing);
  // 안쪽 도넛
  const innerRing = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.42, 32),
    new THREE.MeshBasicMaterial({ color: 0xff7a9c, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  );
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.y = 0.01;
  group.add(innerRing);
  // 중앙 점
  const dot = new THREE.Mesh(
    new THREE.CircleGeometry(0.12, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, side: THREE.DoubleSide })
  );
  dot.rotation.x = -Math.PI / 2;
  dot.position.y = 0.02;
  group.add(dot);
  
  group.visible = false;
  group.userData = { outerRing, innerRing, dot };
  return group;
}

function showDestinationMarker(x, z) {
  if (!destinationMarker) {
    destinationMarker = createDestinationMarker();
    scene.add(destinationMarker);
  }
  destinationMarker.position.set(x, 0.03, z);
  destinationMarker.visible = true;
}

function hideDestinationMarker() {
  if (destinationMarker) destinationMarker.visible = false;
}

function updateDestinationMarker(dt) {
  if (!destinationMarker || !destinationMarker.visible) return;
  // 펄스 효과
  const t = performance.now() * 0.003;
  const pulse = 0.85 + Math.sin(t) * 0.15;
  destinationMarker.userData.outerRing.scale.set(pulse, pulse, 1);
  destinationMarker.userData.outerRing.material.opacity = 0.3 + Math.sin(t) * 0.3;
  // 살짝 회전
  destinationMarker.rotation.y += dt * 0.8;
}

// =========================================================
// 유저 아바타 스폰/제거/이동
// =========================================================
function spawnUserMesh() {
  if (state.user.mesh) return; // 이미 있음
  const mesh = createUserMesh();
  // 광장 중앙에서 시작
  mesh.position.set(0, 0, 0);
  mesh.userData = { type: 'user' };
  scene.add(mesh);
  state.user.mesh = mesh;
  state.user.position = { x: 0, z: 0 };
  state.user.targetPos = null;
  state.user.moving = false;
  
  // 유저 이름표 (항상 보이는 말풍선)
  const bubble = document.createElement('div');
  bubble.className = 'speech-bubble';
  bubble.style.borderColor = '#7ab8e8';
  bubble.style.background = 'linear-gradient(135deg, #e8f4fc 0%, #d4e8f8 100%)';
  bubble.textContent = '🧑 나';
  document.getElementById('app').appendChild(bubble);
  state.user.bubbleEl = bubble;
}

function moveUserTo(x, z, options = {}) {
  // options.stopDistance: 목표로부터 이 거리만큼 떨어진 곳에 멈춤 (NPC 접근 시 사용)
  // options.onArrive: 도착 시 실행할 콜백
  // options.pendingNpcId: 이 NPC에게 접근 중이라는 표시
  state.user.targetPos = { x, z, stopDistance: options.stopDistance || 0 };
  state.user.moving = true;
  state.user.onArrive = options.onArrive || null;
  state.user.pendingNpcId = options.pendingNpcId || null;
  showDestinationMarker(x, z);
}

function updateUser(dt) {
  const u = state.user;
  if (!u.mesh) return;
  
  // 이름표 위치 업데이트
  if (u.bubbleEl) {
    const vec = u.mesh.position.clone();
    vec.y += 2.5;
    vec.project(camera);
    if (vec.z > 1 || vec.z < -1) {
      u.bubbleEl.classList.add('hide');
    } else {
      u.bubbleEl.classList.remove('hide');
      const sx = (vec.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-vec.y * 0.5 + 0.5) * window.innerHeight;
      u.bubbleEl.style.left = sx + 'px';
      u.bubbleEl.style.top = sy + 'px';
    }
  }
  
  if (!u.moving || !u.targetPos) {
    u.mesh.position.y = 0;
    return;
  }
  
  // pendingNpcId가 있으면 타겟 좌표를 실시간으로 NPC 위치로 갱신 (움직이는 NPC 추적)
  if (u.pendingNpcId) {
    const npcMesh = npcMeshes[u.pendingNpcId]?.mesh;
    if (npcMesh) {
      u.targetPos.x = npcMesh.position.x;
      u.targetPos.z = npcMesh.position.z;
      showDestinationMarker(u.targetPos.x, u.targetPos.z);
    }
  }
  
  const dx = u.targetPos.x - u.mesh.position.x;
  const dz = u.targetPos.z - u.mesh.position.z;
  const distance = Math.hypot(dx, dz);
  const stopDist = u.targetPos.stopDistance || 0.2;
  
  if (distance <= stopDist) {
    // 도착
    u.moving = false;
    u.mesh.position.y = 0;
    hideDestinationMarker();
    const arrivedAt = { x: u.mesh.position.x, z: u.mesh.position.z };
    u.position = arrivedAt;
    const cb = u.onArrive;
    const pendingId = u.pendingNpcId;
    u.onArrive = null;
    u.pendingNpcId = null;
    u.targetPos = null;
    if (cb) cb(pendingId);
    return;
  }
  
  // 이동
  const dirX = dx / distance;
  const dirZ = dz / distance;
  const newX = u.mesh.position.x + dirX * u.speed * dt;
  const newZ = u.mesh.position.z + dirZ * u.speed * dt;
  
  if (state.viewMode === 'interior') {
    // 인테리어 안: 충돌 대신 벽 안쪽으로 clamp (6x6 기준으로 ±5)
    u.mesh.position.x = Math.max(-5, Math.min(5, newX));
    u.mesh.position.z = Math.max(-5, Math.min(5, newZ));
  } else {
    // 외부: 기존 충돌 처리 — 건물·나무·연못·다른 NPC와 겹치지 않게 밀어냄
    const resolved = { x: newX, z: newZ };
    resolveCollisions(resolved, 'user');
    u.mesh.position.x = resolved.x;
    u.mesh.position.z = resolved.z;
  }
  
  u.mesh.rotation.y = Math.atan2(dirX, dirZ);
  // 걷기 바운스
  u.bounce += dt * 8;
  u.mesh.position.y = Math.abs(Math.sin(u.bounce)) * 0.06;
  u.position.x = u.mesh.position.x;
  u.position.z = u.mesh.position.z;
  
  // 목적지가 장애물 안쪽이라 계속 접근 불가인 경우 타임아웃으로 멈춤
  // (장애물에 막혀서 제자리에 있는 경우 0.5초 이상 지나면 포기)
  if (!u._prevPos) u._prevPos = { x: u.mesh.position.x, z: u.mesh.position.z, t: performance.now() };
  const moved = Math.hypot(u.mesh.position.x - u._prevPos.x, u.mesh.position.z - u._prevPos.z);
  const elapsed = performance.now() - u._prevPos.t;
  if (moved > 0.3) {
    u._prevPos = { x: u.mesh.position.x, z: u.mesh.position.z, t: performance.now() };
  } else if (elapsed > 800) {
    // 0.8초 동안 거의 못 움직였으면 포기
    console.log('[user] stuck, giving up');
    u.moving = false;
    u.targetPos = null;
    hideDestinationMarker();
    u._prevPos = null;
  }
}

// NPC까지의 거리 계산 (유저 메시 기준)
function distanceToNpc(npcId) {
  const npcMesh = npcMeshes[npcId]?.mesh;
  if (!npcMesh || !state.user.mesh) return Infinity;
  const dx = npcMesh.position.x - state.user.mesh.position.x;
  const dz = npcMesh.position.z - state.user.mesh.position.z;
  return Math.hypot(dx, dz);
}

// 씬에 표시되는 NPC 3D 객체 관리
const npcMeshes = {}; // id -> {mesh, target, state, speechBubbleEl, walkTimer}

function getRandomLocation() {
  // userOnly 장소(우리집)는 NPC 이동 대상에서 제외
  const pool = LOCATIONS.filter(l => !l.userOnly);
  const loc = pool[Math.floor(Math.random() * pool.length)];
  return new THREE.Vector3(loc.x + (Math.random()-0.5)*1.5, 0, loc.z + (Math.random()-0.5)*1.5);
}

function getFavoriteLocation(npc) {
  // 1. 이름 기반 특수 매핑 (우선순위 최상)
  const name = (npc.name || '');
  if (name === '루루') return LOCATIONS[2]; // 카페 (바리스타)
  if (name === '차카') return LOCATIONS[1]; // 사진관
  if (name === '야미') return LOCATIONS[0]; // 광장 (책은 서점에서 사지만 상주는 광장)
  if (name === '밤톨') return LOCATIONS[4]; // 서점 (주인)
  
  // 2. 직업/꿈 텍스트 기반 매핑
  const job = (npc.job || '').toLowerCase();
  const dream = (npc.dream || '').toLowerCase();
  const combined = job + ' ' + dream;
  
  // 사진/카메라 관련 → 사진관
  if (combined.match(/사진|카메라|촬영|포토|야경/)) return LOCATIONS[1];
  // 카페/커피/바리스타 → 카페
  if (combined.match(/카페|커피|바리스타|음료|티|차/)) return LOCATIONS[2];
  // 꽃/플로리스트/정원 → 꽃가게
  if (combined.match(/꽃|플로리|정원|원예/)) return LOCATIONS[3];
  // 책/작가/서점/문학 → 서점
  if (combined.match(/책|작가|서점|시인|시|문학|독서|소설|편집/)) return LOCATIONS[4];
  // 예술/음악/낚시/명상 → 연못
  if (combined.match(/낚시|예술|음악|명상|자연/)) return LOCATIONS[5];
  
  // 3. 종족 기반 폴백
  const species = npc.species;
  if (species === '거북이') return LOCATIONS[5]; // 연못
  if (species === '토끼') return LOCATIONS[3]; // 꽃가게
  if (species === '부엉이') return LOCATIONS[4]; // 서점
  if (species === '앵무새') return LOCATIONS[0]; // 광장 (수다쟁이)
  if (species === '고양이') return LOCATIONS[2]; // 카페
  if (species === '너구리') return LOCATIONS[1]; // 사진관
  if (species === '다람쥐') return LOCATIONS[4]; // 서점
  
  // 4. 최종 폴백: 랜덤 (단, 우리집 제외)
  const pool = LOCATIONS.filter(l => !l.userOnly);
  return pool[Math.floor(Math.random() * pool.length)];
}

function spawnNpcMesh(npc) {
  const animal = ANIMALS.find(a => a.species === npc.species);
  const mesh = createNpcMesh(animal);
  // 초기 스폰 위치는 자기 favorite 장소 근처에서 시작
  const fav = getFavoriteLocation(npc);
  const startX = fav.x + (Math.random() - 0.5) * 2.5;
  const startZ = fav.z + (Math.random() - 0.5) * 2.5;
  mesh.position.set(startX, 0, startZ);
  mesh.userData = { type: 'npc', npcId: npc.id };
  
  // location에 따라 씬 결정
  // 'outside'면 외부 scene에, 다른 값이면 아직 인테리어 진입 전이므로 일단 scene에 두되 보이지 않게
  const loc = npc.location || 'outside';
  if (loc === 'outside') {
    scene.add(mesh);
    mesh.visible = true;
  } else {
    scene.add(mesh);
    mesh.visible = false; // 외부 씬에서는 안 보임
  }
  
  // 이름 말풍선 DOM (항상 표시, 하지만 location이 현재 뷰와 맞을 때만)
  const bubble = document.createElement('div');
  bubble.className = 'speech-bubble' + (npc.isStory ? ' story' : '');
  bubble.textContent = `${animal.emoji} ${npc.name}`;
  document.getElementById('app').appendChild(bubble);
  
  npcMeshes[npc.id] = {
    mesh,
    target: getFavoriteLocation(npc),
    targetPos: null,
    state: 'walking',
    speechBubbleEl: bubble,
    walkTimer: 0,
    idleTimer: 0,
    bounce: 0,
    chatMessage: null,
    chatTimer: 0,
    currentScene: loc === 'outside' ? 'outside' : 'waiting',
    // 건물 외출/귀가 상태 머신
    // 'in_building' | 'outgoing' | 'wandering' | 'returning'
    buildingState: loc === 'outside' ? 'wandering' : 'in_building',
    // 다음 상태 전환까지 남은 시간 (초)
    outingTimer: 10 + Math.random() * 20, // 초기 10~30초
  };
  const t = npcMeshes[npc.id].target;
  npcMeshes[npc.id].targetPos = new THREE.Vector3(t.x + (Math.random()-0.5)*1.5, 0, t.z + (Math.random()-0.5)*1.5);
}

function removeNpcMesh(npcId) {
  if (npcMeshes[npcId]) {
    scene.remove(npcMeshes[npcId].mesh);
    npcMeshes[npcId].speechBubbleEl.remove();
    delete npcMeshes[npcId];
  }
}

// =========================================================
// 인테리어 씬 (건물 내부)
// =========================================================
const interiorScene = new THREE.Scene();
interiorScene.fog = new THREE.Fog(0xfef3e7, 15, 40);

const interiorAmbient = new THREE.AmbientLight(0xffffff, 0.7);
interiorScene.add(interiorAmbient);
const interiorLight = new THREE.DirectionalLight(0xffffff, 0.6);
interiorLight.position.set(3, 8, 3);
interiorLight.castShadow = true;
interiorLight.shadow.mapSize.width = 1024;
interiorLight.shadow.mapSize.height = 1024;
interiorScene.add(interiorLight);
const interiorPoint = new THREE.PointLight(0xfff0cc, 0.6, 20);
interiorPoint.position.set(0, 5, 0);
interiorScene.add(interiorPoint);

function updateInteriorLighting() {
  const t = state.timeOfDay;
  let ambientIntensity, dirIntensity, pointIntensity, lightTint;
  
  if (t < 0.2 || t > 0.85) {
    // 밤: 전등(point)이 주요 광원
    ambientIntensity = 0.25;
    dirIntensity = 0.15;
    pointIntensity = 1.2;
    lightTint = new THREE.Color(0xffd580);
  } else if (t < 0.3) {
    // 아침: 은은한 빛
    ambientIntensity = 0.5;
    dirIntensity = 0.4;
    pointIntensity = 0.4;
    lightTint = new THREE.Color(0xffcba4);
  } else if (t < 0.65) {
    // 낮: 창으로 햇빛 들어옴
    ambientIntensity = 0.6;
    dirIntensity = 0.7;
    pointIntensity = 0.2;
    lightTint = new THREE.Color(0xffffff);
  } else {
    // 저녁: 따뜻한 색조
    ambientIntensity = 0.4;
    dirIntensity = 0.35;
    pointIntensity = 0.7;
    lightTint = new THREE.Color(0xffa76b);
  }
  
  interiorAmbient.intensity = ambientIntensity;
  interiorLight.intensity = dirIntensity;
  interiorLight.color = lightTint;
  interiorPoint.intensity = pointIntensity;
  
  // 실내 배경색도 시간대에 맞추기 (창밖 느낌)
  let bgColor;
  if (t < 0.2 || t > 0.85) bgColor = new THREE.Color(0x2a3a5c);
  else if (t < 0.3) bgColor = new THREE.Color(0xfdd9b4);
  else if (t < 0.65) bgColor = new THREE.Color(0xfef3e7);
  else bgColor = new THREE.Color(0xffb085);
  renderer.setClearColor(bgColor);
  interiorScene.fog.color = bgColor;
}

const interiorObjects = new THREE.Group();
interiorScene.add(interiorObjects);

function makeFloor(color) {
  const floorGeo = new THREE.PlaneGeometry(12, 12);
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ color }));
  floor.rotation.x = -Math.PI/2;
  floor.receiveShadow = true;
  return floor;
}
function makeWall(width, height, color, position, rotationY = 0) {
  const geo = new THREE.PlaneGeometry(width, height);
  const wall = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide }));
  wall.position.copy(position);
  wall.rotation.y = rotationY;
  wall.receiveShadow = true;
  return wall;
}
function makeBox(w, h, d, color, x, y, z, castShadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color }));
  m.position.set(x, y, z);
  m.castShadow = castShadow;
  m.receiveShadow = true;
  return m;
}

function buildInterior(type) {
  // 기존 오브젝트 제거
  while (interiorObjects.children.length) interiorObjects.remove(interiorObjects.children[0]);
  
  // 공통 바닥
  const floorColors = {
    photostudio: 0x4a3a52,
    cafe: 0xc9a57a,
    flower: 0xd4e8d0,
    bookstore: 0xb8956d,
    home: 0xc89978, // 따뜻한 나무 바닥
  };
  interiorObjects.add(makeFloor(floorColors[type] || 0xe8dcc0));
  
  // 공통 벽
  const wallColor = {
    photostudio: 0x2a2530,
    cafe: 0xf0d8c4,
    flower: 0xfde8ec,
    bookstore: 0xe8dcc4,
    home: 0xf8ebd4, // 부드러운 크림색
  }[type] || 0xfef3e7;
  interiorObjects.add(makeWall(12, 6, wallColor, new THREE.Vector3(0, 3, -6)));
  interiorObjects.add(makeWall(12, 6, wallColor, new THREE.Vector3(-6, 3, 0), Math.PI/2));
  interiorObjects.add(makeWall(12, 6, wallColor, new THREE.Vector3(6, 3, 0), Math.PI/2));
  
  // 천장
  const ceilColor = type === 'photostudio' ? 0x1a1820 : 0xf5e6d0;
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: ceilColor, side: THREE.DoubleSide }));
  ceil.rotation.x = Math.PI/2;
  ceil.position.y = 6;
  interiorObjects.add(ceil);
  
  if (type === 'home') {
    // ============ 유저의 집 (원룸 스튜디오) ============
    // 공간 배치 개요 (위에서 본 것):
    //   뒷벽(-6z) -------------------
    //   [책장]   [창문]    [옷장]
    //                
    //   [책상/의자]        [침대]
    //                
    //           [러그]
    //       [소파] [TV]
    //   앞벽(+6z) -------------------
    //
    // 1) 러그 (중앙 바닥) — 다른 가구 배치 전에 깔아야 위에 겹쳐 보임
    const rug = new THREE.Mesh(
      new THREE.CircleGeometry(3.2, 32),
      new THREE.MeshStandardMaterial({ color: 0xd4a5a5 })
    );
    rug.rotation.x = -Math.PI/2;
    rug.position.set(0, 0.02, 1);
    interiorObjects.add(rug);
    // 러그 안쪽 원 (장식)
    const rugInner = new THREE.Mesh(
      new THREE.CircleGeometry(2.2, 32),
      new THREE.MeshStandardMaterial({ color: 0xe8c0c0 })
    );
    rugInner.rotation.x = -Math.PI/2;
    rugInner.position.set(0, 0.03, 1);
    interiorObjects.add(rugInner);
    
    // 2) 침대 (우측, 뒷벽 쪽) — 클릭 가능하게 userData 부여
    const bedGroup = new THREE.Group();
    // 침대 매트리스 (흰 시트)
    const mattress = makeBox(2.4, 0.5, 1.5, 0xfafafa, 0, 0.4, 0);
    bedGroup.add(mattress);
    // 침대 프레임 (나무)
    const bedFrame = makeBox(2.6, 0.35, 1.7, 0x8b5a3c, 0, 0.18, 0);
    bedGroup.add(bedFrame);
    // 헤드보드 (침대 머리 쪽, 뒷벽 방향)
    const headboard = makeBox(2.6, 1.2, 0.15, 0x6b4423, 0, 0.85, -0.77);
    bedGroup.add(headboard);
    // 이불 (파스텔 블루)
    const blanket = makeBox(2.3, 0.1, 1.0, 0x9ec5eb, 0, 0.68, 0.25);
    bedGroup.add(blanket);
    // 베개 (2개)
    const pillow1 = makeBox(0.7, 0.2, 0.5, 0xffe4ec, -0.6, 0.76, -0.45);
    bedGroup.add(pillow1);
    const pillow2 = makeBox(0.7, 0.2, 0.5, 0xffd6d6, 0.55, 0.76, -0.45);
    bedGroup.add(pillow2);
    // 침대 그룹 위치 + userData (클릭 상호작용용)
    bedGroup.position.set(3.4, 0, -3);
    bedGroup.rotation.y = Math.PI / 2; // 침대 머리가 벽을 향하도록
    bedGroup.userData = { type: 'bed', name: '침대' };
    // 침대 내부 모든 메시에도 같은 userData 심어서 raycast 시 잡히게
    bedGroup.traverse(obj => {
      if (obj.isMesh) obj.userData.bedRef = bedGroup;
    });
    interiorObjects.add(bedGroup);
    
    // 침대 옆 작은 협탁 + 램프
    const nightstand = makeBox(0.7, 0.7, 0.7, 0x8b5a3c, 3.4, 0.35, -0.8);
    interiorObjects.add(nightstand);
    // 램프 받침
    const lampBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.18, 0.3, 12),
      new THREE.MeshStandardMaterial({ color: 0x3a2a1a })
    );
    lampBase.position.set(3.4, 0.85, -0.8);
    interiorObjects.add(lampBase);
    // 램프 갓 (노란 빛)
    const lampShade = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 0.4, 12),
      new THREE.MeshStandardMaterial({ color: 0xfff0b3, emissive: 0x665530 })
    );
    lampShade.position.set(3.4, 1.2, -0.8);
    interiorObjects.add(lampShade);
    
    // 3) 책상 + 의자 (좌측, 뒷벽 쪽)
    const desk = makeBox(2.0, 0.1, 1.0, 0xa47c5a, -3.2, 1.05, -5.0);
    interiorObjects.add(desk);
    // 책상 다리 4개
    for (const [dx, dz] of [[-0.9, -0.45], [0.9, -0.45], [-0.9, 0.45], [0.9, 0.45]]) {
      const leg = makeBox(0.1, 1.0, 0.1, 0x7a5a3a, -3.2 + dx, 0.5, -5.0 + dz);
      interiorObjects.add(leg);
    }
    // 책상 위 노트북 (닫힘)
    const laptop = makeBox(0.7, 0.05, 0.5, 0x3a3a3a, -3.0, 1.13, -5.1);
    interiorObjects.add(laptop);
    // 책상 위 책 더미 (3권)
    for (let i = 0; i < 3; i++) {
      const bookColors = [0xc75a5a, 0x5a7ac7, 0xd4a93a];
      const book = makeBox(0.45, 0.08, 0.3, bookColors[i], -3.8, 1.14 + i * 0.085, -5.2);
      interiorObjects.add(book);
    }
    // 책상 위 머그컵 (작은 원통)
    const mug = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.1, 0.2, 16),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    mug.position.set(-2.4, 1.2, -5.1);
    interiorObjects.add(mug);
    // 의자 (책상 앞)
    const chairSeat = makeBox(0.7, 0.08, 0.7, 0x8b5a3c, -3.2, 0.5, -4.2);
    interiorObjects.add(chairSeat);
    const chairBack = makeBox(0.7, 0.9, 0.08, 0x8b5a3c, -3.2, 0.95, -4.55);
    interiorObjects.add(chairBack);
    for (const [dx, dz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
      const leg = makeBox(0.06, 0.5, 0.06, 0x6b4423, -3.2 + dx, 0.25, -4.2 + dz);
      interiorObjects.add(leg);
    }
    
    // 4) 책장 (좌측 벽에 붙임)
    const bookshelf = makeBox(0.5, 3.0, 2.2, 0x6b4423, -5.5, 1.5, -3);
    interiorObjects.add(bookshelf);
    // 책장 선반 (3줄)
    for (let i = 0; i < 3; i++) {
      const shelfY = 0.5 + i * 0.9;
      // 선반마다 책 여러 권
      for (let j = 0; j < 7; j++) {
        const bookColors = [0xc75a5a, 0x5a7ac7, 0xd4a93a, 0x7ac75a, 0xc75aa7, 0x5ac7a7, 0xa75ac7];
        const h = 0.55 + Math.random() * 0.2;
        const book = makeBox(0.15, h, 0.35, bookColors[j % bookColors.length], -5.25, shelfY + h/2 - 0.1, -3.9 + j * 0.26);
        interiorObjects.add(book);
      }
    }
    
    // 5) 옷장 (우측 벽에 붙임, 침대와 분리)
    const wardrobe = makeBox(0.6, 3.0, 2.0, 0x8b5a3c, 5.6, 1.5, 4);
    interiorObjects.add(wardrobe);
    // 옷장 문손잡이 2개
    for (const y of [1.3, 1.7]) {
      const handle = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xd4af37 })
      );
      handle.position.set(5.28, y, 3.5);
      interiorObjects.add(handle);
    }
    // 옷장 문 분할선 (세로선 — 얇은 박스로 표현)
    const wardrobeSplit = makeBox(0.02, 2.8, 0.05, 0x3a2a1a, 5.28, 1.5, 4);
    interiorObjects.add(wardrobeSplit);
    
    // 6) 소파 (중앙 앞쪽)
    const sofaSeat = makeBox(3.2, 0.5, 1.2, 0x9ab6d4, 0, 0.5, 3.8);
    interiorObjects.add(sofaSeat);
    const sofaBack = makeBox(3.2, 1.0, 0.3, 0x8aa6c4, 0, 1.0, 4.4);
    interiorObjects.add(sofaBack);
    // 소파 팔걸이 (양쪽)
    const sofaArmL = makeBox(0.3, 0.7, 1.2, 0x8aa6c4, -1.6, 0.85, 3.8);
    interiorObjects.add(sofaArmL);
    const sofaArmR = makeBox(0.3, 0.7, 1.2, 0x8aa6c4, 1.6, 0.85, 3.8);
    interiorObjects.add(sofaArmR);
    // 쿠션 3개
    for (let i = 0; i < 3; i++) {
      const cushionColors = [0xffd6d6, 0xffe4a5, 0xd6e4ff];
      const cushion = makeBox(0.7, 0.2, 0.6, cushionColors[i], -1.0 + i * 1.0, 0.8, 3.7);
      interiorObjects.add(cushion);
    }
    
    // 7) 작은 티테이블 (소파 앞)
    const teaTable = makeBox(1.2, 0.5, 0.7, 0x6b4423, 0, 0.25, 2.3);
    interiorObjects.add(teaTable);
    // 티테이블 위 찻잔 (작은 원통)
    const teacup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.08, 0.15, 12),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    teacup.position.set(-0.3, 0.58, 2.3);
    interiorObjects.add(teacup);
    // 티테이블 위 잡지/책
    const mag = makeBox(0.5, 0.04, 0.35, 0xc75aa7, 0.2, 0.52, 2.3);
    interiorObjects.add(mag);
    
    // 8) 창문 (뒷벽 중앙, 책상과 옷장 사이)
    const homeWindowFrame = makeBox(2.0, 1.5, 0.1, 0xffffff, 0, 3, -5.95);
    interiorObjects.add(homeWindowFrame);
    const homeWindow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 1.2),
      new THREE.MeshStandardMaterial({ color: 0xa8d0dc, emissive: 0x1a2530 })
    );
    homeWindow.position.set(0, 3, -5.89);
    interiorObjects.add(homeWindow);
    // 창문 십자 프레임
    const winCrossV = makeBox(0.05, 1.2, 0.02, 0xffffff, 0, 3, -5.88);
    interiorObjects.add(winCrossV);
    const winCrossH = makeBox(1.7, 0.05, 0.02, 0xffffff, 0, 3, -5.88);
    interiorObjects.add(winCrossH);
    
    // 9) 벽 장식 — 액자 2개 (소파 위쪽 벽... 실제로는 소파 뒤가 벽이 아니므로 책장 옆 빈 벽에)
    // 뒷벽 왼쪽 (책장과 창문 사이)에 작은 액자
    const pic1 = makeBox(0.8, 0.6, 0.05, 0xfafafa, -2.5, 4, -5.95);
    interiorObjects.add(pic1);
    const picArt1 = makeBox(0.6, 0.45, 0.03, 0xfad4a5, -2.5, 4, -5.93);
    interiorObjects.add(picArt1);
    // 뒷벽 오른쪽 (창문과 옷장 사이)
    const pic2 = makeBox(0.7, 0.7, 0.05, 0xfafafa, 2.8, 4, -5.95);
    interiorObjects.add(pic2);
    const picArt2 = makeBox(0.55, 0.55, 0.03, 0xa5d4fa, 2.8, 4, -5.93);
    interiorObjects.add(picArt2);
    
    // 10) 식물 화분 (창문 옆 바닥)
    const potBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.25, 0.5, 12),
      new THREE.MeshStandardMaterial({ color: 0xc75a5a })
    );
    potBase.position.set(-1.8, 0.25, -5.3);
    interiorObjects.add(potBase);
    // 잎사귀 (녹색 구)
    const leaves = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x6bb585 })
    );
    leaves.position.set(-1.8, 0.85, -5.3);
    interiorObjects.add(leaves);
    // 잎사귀 2 (위쪽 더 작은 구)
    const leaves2 = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x7ac59a })
    );
    leaves2.position.set(-1.8, 1.2, -5.2);
    interiorObjects.add(leaves2);
  }
  else if (type === 'photostudio') {
    // 사진 전시 벽 (뒷벽)
    const photoColors = [0xfff0cc, 0xffd6cc, 0xd4a5f5, 0xfad4d8, 0xc9dcf5, 0xa8dcc3, 0xffc896, 0xe8dcc4];
    // 2행 5열 사진 프레임
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 5; col++) {
        // 프레임 (흰색)
        const frame = makeBox(1.4, 1.1, 0.08, 0xfafafa, -4.4 + col * 2.2, 1.5 + row * 1.8, -5.9);
        interiorObjects.add(frame);
        // 사진 내용 (색 샘플)
        const photo = makeBox(1.2, 0.9, 0.05, photoColors[(row * 5 + col) % photoColors.length], -4.4 + col * 2.2, 1.5 + row * 1.8, -5.85);
        interiorObjects.add(photo);
      }
    }
    // 삼각대 + 카메라 (좌측)
    const tripodMat = 0x2a2a2a;
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6),
        new THREE.MeshStandardMaterial({ color: tripodMat })
      );
      const ang = (i / 3) * Math.PI * 2;
      leg.position.set(-4 + Math.cos(ang) * 0.25, 1.1, 2 + Math.sin(ang) * 0.25);
      leg.rotation.z = Math.cos(ang) * 0.15;
      leg.rotation.x = Math.sin(ang) * 0.15;
      leg.castShadow = true;
      interiorObjects.add(leg);
    }
    // 카메라 본체
    const cam = makeBox(0.8, 0.55, 0.5, 0x1a1a1a, -4, 2.3, 2);
    interiorObjects.add(cam);
    // 렌즈
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.28, 0.5, 16),
      new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    lens.position.set(-4, 2.3, 2.5);
    lens.rotation.x = Math.PI / 2;
    lens.castShadow = true;
    interiorObjects.add(lens);
    const lensInner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.17, 0.08, 16),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x224466, emissiveIntensity: 0.3 })
    );
    lensInner.position.set(-4, 2.3, 2.78);
    lensInner.rotation.x = Math.PI / 2;
    interiorObjects.add(lensInner);
    
    // 조명 우산 (우측)
    const umbrellaStand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 2.8, 6),
      new THREE.MeshStandardMaterial({ color: 0x555555 })
    );
    umbrellaStand.position.set(3.5, 1.4, 2);
    umbrellaStand.castShadow = true;
    interiorObjects.add(umbrellaStand);
    const umbrella = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xfff5e0, side: THREE.DoubleSide, emissive: 0xfff0cc, emissiveIntensity: 0.3 })
    );
    umbrella.position.set(3.5, 2.8, 2);
    umbrella.rotation.x = Math.PI;
    interiorObjects.add(umbrella);
    
    // 카운터/작업대 (중앙)
    const counter = makeBox(2.5, 1, 1.2, 0x6b4c52, 0, 0.5, 0);
    interiorObjects.add(counter);
    const counterTop = makeBox(2.5, 0.08, 1.2, 0x8b6a72, 0, 1.04, 0);
    interiorObjects.add(counterTop);
    // 사진 앨범 / 노트북
    const laptop = makeBox(0.8, 0.04, 0.6, 0x888888, 0, 1.1, 0);
    interiorObjects.add(laptop);
    const screen = makeBox(0.75, 0.5, 0.03, 0x1a1a2a, 0, 1.35, -0.28);
    screen.rotation.x = -0.2;
    interiorObjects.add(screen);
    const screenOn = makeBox(0.7, 0.45, 0.02, 0x4466aa, 0, 1.35, -0.26);
    screenOn.rotation.x = -0.2;
    interiorObjects.add(screenOn);
    
    // 바닥에 작은 소품 (필름 박스 같은 것)
    interiorObjects.add(makeBox(0.3, 0.2, 0.3, 0xc44536, -2, 0.1, 4));
    interiorObjects.add(makeBox(0.3, 0.2, 0.3, 0xfff0cc, 2, 0.1, 4));
  }
  else if (type === 'cafe') {
    // 바 카운터
    const bar = makeBox(7, 1.1, 1, 0x8b5a2b, 0, 0.55, -4.5);
    interiorObjects.add(bar);
    const barTop = makeBox(7, 0.1, 1.2, 0xd4a574, 0, 1.15, -4.5);
    interiorObjects.add(barTop);
    // 에스프레소 머신
    const machine = makeBox(1.2, 0.9, 0.8, 0xc0c0c0, -2, 1.65, -4.5);
    interiorObjects.add(machine);
    const machineDisplay = makeBox(0.4, 0.3, 0.05, 0x222222, -2, 1.75, -4.05);
    interiorObjects.add(machineDisplay);
    // 컵 몇 개
    for (let i = 0; i < 4; i++) {
      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.1, 0.25, 16),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
      );
      cup.position.set(0 + i * 0.4, 1.32, -4.3);
      cup.castShadow = true;
      interiorObjects.add(cup);
      // 커피 색
      const coffee = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.02, 16),
        new THREE.MeshStandardMaterial({ color: 0x4a2817 })
      );
      coffee.position.set(0 + i * 0.4, 1.44, -4.3);
      interiorObjects.add(coffee);
    }
    // 라운드 테이블 2개
    for (const [tx, tz] of [[-2, 2], [2.5, 2]]) {
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 0.9, 0.12, 24),
        new THREE.MeshStandardMaterial({ color: 0xd4a574 })
      );
      top.position.set(tx, 1, tz);
      top.castShadow = true;
      interiorObjects.add(top);
      const pillar = makeBox(0.2, 1, 0.2, 0x6b4423, tx, 0.5, tz);
      interiorObjects.add(pillar);
      // 의자
      for (const [cx, cz] of [[-1.3, 0], [1.3, 0]]) {
        interiorObjects.add(makeBox(0.7, 0.15, 0.7, 0xd4a5f5, tx + cx, 0.5, tz + cz));
      }
    }
    // 메뉴 보드
    const board = makeBox(2, 1.2, 0.05, 0x6b4423, 3, 3, -5.95);
    interiorObjects.add(board);
    const boardInner = makeBox(1.8, 1, 0.02, 0x333333, 3, 3, -5.92);
    interiorObjects.add(boardInner);
  }
  else if (type === 'flower') {
    // 꽃 진열대 여러 개
    const flowerColorSets = [
      [0xff9ebb, 0xffb8d0], [0xffd580, 0xffe4a8], [0xc9b2f5, 0xdcc8ff],
      [0xfad4d8, 0xffe4e8], [0xa8dcc3, 0xc8ecd3],
    ];
    const stands = [[-4, -4.5], [-1.5, -4.5], [1.5, -4.5], [4, -4.5], [-4, 3], [4, 3]];
    stands.forEach(([sx, sz], idx) => {
      // 나무 박스
      interiorObjects.add(makeBox(1.4, 0.8, 1.4, 0x8b5a2b, sx, 0.4, sz));
      // 화분의 꽃들
      const colors = flowerColorSets[idx % flowerColorSets.length];
      for (let i = 0; i < 5; i++) {
        const flower = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 8, 8),
          new THREE.MeshStandardMaterial({ color: colors[i % 2] })
        );
        flower.position.set(
          sx + (Math.random() - 0.5) * 0.8,
          1.1 + Math.random() * 0.3,
          sz + (Math.random() - 0.5) * 0.8
        );
        flower.castShadow = true;
        interiorObjects.add(flower);
        // 줄기
        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6),
          new THREE.MeshStandardMaterial({ color: 0x6bb585 })
        );
        stem.position.set(flower.position.x, flower.position.y - 0.25, flower.position.z);
        interiorObjects.add(stem);
      }
    });
    // 중앙 카운터
    const counter = makeBox(2.5, 1, 1.2, 0xdcc8ff, 0, 0.5, 1);
    interiorObjects.add(counter);
    // 리본과 바구니
    const basket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.3, 0.3, 12),
      new THREE.MeshStandardMaterial({ color: 0xc9a57a })
    );
    basket.position.set(0, 1.15, 1);
    basket.castShadow = true;
    interiorObjects.add(basket);
  }
  else if (type === 'bookstore') {
    // 큰 책장들 (벽을 따라)
    const bookColors = [0xc44536, 0x6b4c93, 0x2d6a4f, 0xf4a261, 0x457b9d, 0xe63946, 0xffd166, 0x457b9d];
    // 뒷벽 책장
    const backShelf = makeBox(10, 5, 0.5, 0x8b5a2b, 0, 2.5, -5.7);
    interiorObjects.add(backShelf);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 14; col++) {
        const book = makeBox(0.25 + Math.random() * 0.1, 0.6 + Math.random() * 0.2, 0.2, bookColors[(row + col) % bookColors.length], -4.5 + col * 0.7, 0.5 + row * 1.2, -5.45);
        interiorObjects.add(book);
      }
    }
    // 좌측 책장
    const leftShelf = makeBox(0.5, 5, 10, 0x8b5a2b, -5.7, 2.5, 0);
    interiorObjects.add(leftShelf);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 14; col++) {
        const book = makeBox(0.2, 0.6 + Math.random() * 0.2, 0.25 + Math.random() * 0.1, bookColors[(row * 2 + col) % bookColors.length], -5.45, 0.5 + row * 1.2, -4.5 + col * 0.7);
        interiorObjects.add(book);
      }
    }
    // 중앙 테이블 (읽는 곳)
    const tableTop = makeBox(3, 0.15, 1.8, 0xc9a57a, 1, 1, 1);
    interiorObjects.add(tableTop);
    for (const [lx, lz] of [[-1.2, -0.7],[1.2, -0.7],[-1.2, 0.7],[1.2, 0.7]]) {
      interiorObjects.add(makeBox(0.15, 1, 0.15, 0x8b5a2b, 1+lx, 0.5, 1+lz));
    }
    // 의자
    interiorObjects.add(makeBox(0.7, 0.15, 0.7, 0xc9dcf5, -0.5, 0.5, 1));
    interiorObjects.add(makeBox(0.7, 0.15, 0.7, 0xc9dcf5, 2.5, 0.5, 1));
    // 책 몇 권 테이블 위
    interiorObjects.add(makeBox(0.6, 0.1, 0.4, 0xc44536, 0.5, 1.12, 1));
    interiorObjects.add(makeBox(0.55, 0.08, 0.4, 0x2d6a4f, 1.7, 1.11, 1.2));
  }
  
  // 공통: 문 (뒤쪽 벽 중앙에 표시)
  const doorFrame = makeBox(1.5, 2.5, 0.1, 0x8b5a2b, 4.5, 1.25, -5.9);
  interiorObjects.add(doorFrame);
  const doorPanel = makeBox(1.2, 2.2, 0.05, 0xc44536, 4.5, 1.1, -5.85);
  interiorObjects.add(doorPanel);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffd700 }));
  knob.position.set(5, 1.1, -5.82);
  interiorObjects.add(knob);
}

function enterInterior(loc) {
  if (!loc.interior) {
    showNotification(`${loc.emoji} ${loc.name}은(는) 들어갈 수 없어요`);
    return;
  }
  state.viewMode = 'interior';
  state.currentInterior = loc;
  buildInterior(loc.interior);
  
  // 외부 씬의 모든 NPC 말풍선 숨기기
  Object.values(npcMeshes).forEach(n => n.speechBubbleEl.classList.add('hide'));
  
  // 유저 메시도 interiorScene으로 이동 (있으면)
  if (state.user.mesh) {
    scene.remove(state.user.mesh);
    interiorScene.add(state.user.mesh);
    // 문 근처(뒷쪽 문 위치와 맞춰 앞쪽)에서 시작
    state.user.mesh.position.set(4, 0, 4);
    state.user.position = { x: 4, z: 4 };
    state.user.targetPos = null;
    state.user.moving = false;
    state.user.mesh.visible = true;
    state.user.currentScene = 'interior';
  }
  
  // 인테리어에 표시할 NPC들: location이 이 건물의 interior 값과 일치하는 NPC들
  if (!loc.userOnly) {
    const targetLocation = loc.interior; // 예: 'bookstore'
    Object.entries(npcMeshes).forEach(([id, m]) => {
      const npc = state.npcs.find(n => n.id == id);
      if (!npc) return;
      if (npc.location === targetLocation) {
        // 이 NPC는 이 건물 안에 있어야 함 → interiorScene으로 이동
        scene.remove(m.mesh);
        interiorScene.add(m.mesh);
        m.mesh.visible = true;
        m.currentScene = 'interior';
        // 인테리어 내 초기 위치 (랜덤)
        m.mesh.position.set(
          (Math.random() - 0.5) * 6,
          0,
          (Math.random() - 0.5) * 6
        );
        m.targetPos = new THREE.Vector3(
          (Math.random() - 0.5) * 6,
          0,
          (Math.random() - 0.5) * 6
        );
        m.state = 'walking';
        // 말풍선 보이기
        m.speechBubbleEl.classList.remove('hide');
      } else {
        // 이 NPC는 이 건물에 없음 → 외부 씬에 남겨두고 안 보이게
        if (m.currentScene === 'interior') {
          // 다른 건물 들어갔다가 나와서 이 건물 들어온 경우: 이전 건물에 그대로 두기 (이론상 발생 X)
          interiorScene.remove(m.mesh);
          scene.add(m.mesh);
          m.currentScene = 'outside';
        }
        m.mesh.visible = false;
      }
    });
  }
  
  // UI 업데이트
  document.getElementById('exit-interior').classList.add('show');
  const titleEl = document.getElementById('interior-title');
  document.getElementById('interior-emoji').textContent = loc.emoji;
  document.getElementById('interior-name').textContent = loc.name;
  titleEl.classList.add('show');
  document.getElementById('hint').style.display = 'none';
  
  // 카메라 인테리어용 위치
  cameraAngle = 0;
  cameraPitch = Math.PI / 3;
  cameraDist = 12;
  cameraTarget.set(0, 1, 0);
  updateCamera();
}

function exitInterior() {
  const prevInterior = state.currentInterior;
  state.viewMode = 'village';
  state.currentInterior = null;
  
  // 유저 메시 외부 복귀 (건물 바로 앞에 배치)
  if (state.user.mesh) {
    interiorScene.remove(state.user.mesh);
    scene.add(state.user.mesh);
    // 방금 나온 건물의 문 쪽(조금 아래) 위치로
    if (prevInterior) {
      const exitX = prevInterior.x;
      const exitZ = prevInterior.z + 3; // 건물 앞
      state.user.mesh.position.set(exitX, 0, exitZ);
      state.user.position = { x: exitX, z: exitZ };
    }
    state.user.targetPos = null;
    state.user.moving = false;
    state.user.currentScene = 'outside';
  }
  
  // 인테리어 씬에 있던 NPC들을 원래 location 기준으로 되돌리기
  // - location이 'outside'로 바뀐 NPC는 외부 scene으로 이동 + 보이게
  // - location이 여전히 해당 건물이면 외부 scene으로 되돌리되 보이지 않게 유지 (다음 진입 시 다시 보이게)
  Object.entries(npcMeshes).forEach(([id, m]) => {
    const npc = state.npcs.find(n => n.id == id);
    if (!npc) return;
    if (m.currentScene === 'interior') {
      // 인테리어 씬에서 외부 씬으로 이동
      interiorScene.remove(m.mesh);
      scene.add(m.mesh);
      m.currentScene = 'outside';
    }
    // location에 따라 visible 조정
    if (npc.location === 'outside') {
      m.mesh.visible = true;
      // 외부로 나올 때 위치를 favorite 근처로 복원
      const fav = getFavoriteLocation(npc);
      m.mesh.position.set(
        fav.x + (Math.random() - 0.5) * 2.5,
        0,
        fav.z + (Math.random() - 0.5) * 2.5
      );
      m.speechBubbleEl.classList.remove('hide');
    } else {
      m.mesh.visible = false;
      m.speechBubbleEl.classList.add('hide');
    }
  });
  
  document.getElementById('exit-interior').classList.remove('show');
  document.getElementById('interior-title').classList.remove('show');
  document.getElementById('hint').style.display = 'block';
  // 카메라 복원
  cameraAngle = Math.PI / 4;
  cameraPitch = Math.PI / 3.5;
  cameraDist = 30;
  cameraTarget.set(0, 0, 0);
  updateCamera();
}

// =========================================================
// NPC 외출/귀가 상태 머신 업데이트
// buildingState: 'in_building' | 'outgoing' | 'wandering' | 'returning'
// =========================================================
function updateNpcBuildingState(dt, id, n, npc) {
  // homeLocation이 'outside'면 상태 머신 작동 안 함 (항상 wandering)
  if (!npc.homeLocation || npc.homeLocation === 'outside') {
    n.buildingState = 'wandering';
    return;
  }
  // 시뮬레이션 중엔 스크립트가 제어하므로 건너뜀
  if (state.simulation.active) return;
  // 밤 시간은 자동 귀가 로직이 따로 있으니 건너뜀
  if (state.phase === 'night') return;
  
  const homeLoc = LOCATIONS.find(l => l.interior === npc.homeLocation);
  if (!homeLoc || !homeLoc.door) return;
  
  n.outingTimer -= dt;
  
  switch (n.buildingState) {
    case 'in_building': {
      // 건물 안에 있음 (visible=false인 상태). 시간이 되면 외출 시도
      if (n.outingTimer <= 0) {
        // 30% 확률로 외출 결정
        if (Math.random() < 0.3) {
          n.buildingState = 'outgoing';
          // 문 좌표로 이동 (외부 씬에 등장)
          if (n.currentScene !== 'outside') {
            // 현재 씬 정리 (아직 interior 씬에 있으면 밖으로)
            if (n.currentScene === 'interior') {
              interiorScene.remove(n.mesh);
              scene.add(n.mesh);
            }
            n.currentScene = 'outside';
          }
          n.mesh.position.set(homeLoc.door.x, 0, homeLoc.door.z);
          n.mesh.visible = true;
          n.speechBubbleEl.classList.remove('hide');
          // 광장 방향으로 목표
          n.targetPos = new THREE.Vector3(
            (Math.random() - 0.5) * 4,
            0,
            (Math.random() - 0.5) * 4
          );
          n.state = 'walking';
          npc.location = 'outside';
          n.outingTimer = 15 + Math.random() * 25; // 15~40초간 외출
        } else {
          n.outingTimer = 10 + Math.random() * 15; // 다시 시도까지 10~25초
        }
      }
      break;
    }
    case 'outgoing': {
      // 광장 방향으로 걸어가는 중 — 일정 거리 벗어나면 wandering
      const distFromDoor = Math.hypot(
        n.mesh.position.x - homeLoc.door.x,
        n.mesh.position.z - homeLoc.door.z
      );
      if (distFromDoor > 2.5) {
        n.buildingState = 'wandering';
      }
      break;
    }
    case 'wandering': {
      // 외부 산책 중. 시간 다 되면 귀가 시도
      if (n.outingTimer <= 0) {
        n.buildingState = 'returning';
        n.targetPos = new THREE.Vector3(homeLoc.door.x, 0, homeLoc.door.z);
        n.state = 'walking';
        n.outingTimer = 20;
      }
      break;
    }
    case 'returning': {
      // 자기 집 문으로 가는 중 — 문에 도달하면 들어감
      const distToDoor = Math.hypot(
        n.mesh.position.x - homeLoc.door.x,
        n.mesh.position.z - homeLoc.door.z
      );
      if (distToDoor < 0.8) {
        // 문에 도달 → 건물로 들어감
        n.buildingState = 'in_building';
        npc.location = npc.homeLocation;
        // 메시를 외부 씬에서 떼어 내부 씬으로? 
        // → 유저가 그 건물에 있을 때만 내부 씬으로 이동, 아니면 일단 visible=false만
        const viewingThisBuilding = (
          state.viewMode === 'interior' &&
          state.currentInterior && state.currentInterior.interior === npc.homeLocation
        );
        if (viewingThisBuilding) {
          scene.remove(n.mesh);
          interiorScene.add(n.mesh);
          n.currentScene = 'interior';
          n.mesh.position.set(
            (Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6
          );
          n.mesh.visible = true;
          n.speechBubbleEl.classList.remove('hide');
          n.targetPos = new THREE.Vector3(
            (Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6
          );
          n.state = 'walking';
        } else {
          n.mesh.visible = false;
          n.speechBubbleEl.classList.add('hide');
        }
        // 타이머 재설정 (다음 외출까지 20~40초)
        n.outingTimer = 20 + Math.random() * 20;
      }
      // targetPos를 문 방향으로 계속 갱신
      n.targetPos = new THREE.Vector3(homeLoc.door.x, 0, homeLoc.door.z);
      n.state = 'walking';
      break;
    }
  }
}

// =========================================================
// NPC 업데이트 루프 (매 프레임)
// =========================================================
function updateNpcs(dt) {
  Object.entries(npcMeshes).forEach(([id, n]) => {
    const npc = state.npcs.find(x => x.id == id);
    if (!npc) return;
    
    // 건물 외출/귀가 상태 머신 (씬 모드와 무관하게 계속 돌아감)
    updateNpcBuildingState(dt, id, n, npc);
    
    // 메시가 visible=false면 이동/말풍선 처리 건너뜀
    if (!n.mesh.visible) {
      n.speechBubbleEl.classList.add('hide');
      return;
    }
    
    // 현재 씬이 뷰 모드와 일치해야 메시 처리
    // (예: interior씬에 있는 NPC는 viewMode='interior'일 때만 움직임)
    const viewInterior = state.viewMode === 'interior';
    if ((n.currentScene === 'interior') !== viewInterior) {
      n.speechBubbleEl.classList.add('hide');
      return;
    }
    
    // 채팅 메시지 타이머
    if (n.chatTimer > 0) {
      n.chatTimer -= dt;
      if (n.chatTimer <= 0 && n.chatMessage) {
        n.chatMessage = null;
        n.speechBubbleEl.textContent = `${npc.emoji} ${npc.name}`;
        n.speechBubbleEl.classList.remove('chatting');
      }
    }
    
    // 밤 자동 귀가는 외부에서만
    if (n.currentScene === 'outside' && state.phase === 'night' && !state.simulation.active) {
      const home = LOCATIONS[1 + (parseInt(id) % 4)];
      n.targetPos = new THREE.Vector3(home.x, 0, home.z);
      n.state = 'walking';
    }
    // 시뮬레이션 중 scriptedTarget이 있으면 그걸로 덮어쓰기
    if (state.simulation.active && n.scriptedTarget) {
      n.targetPos = n.scriptedTarget;
      n.state = 'walking';
    }
    
    if (n.state === 'walking' && n.targetPos) {
      const dir = new THREE.Vector3().subVectors(n.targetPos, n.mesh.position);
      dir.y = 0;
      const distance = dir.length();
      if (distance < 0.3) {
        n.state = 'idle';
        n.idleTimer = 1.5 + Math.random() * 3;
      } else {
        dir.normalize();
        const speed = n.currentScene === 'interior' ? 1.3 : 2.0;
        const newX = n.mesh.position.x + dir.x * speed * dt;
        const newZ = n.mesh.position.z + dir.z * speed * dt;
        // 충돌 해소는 외부에서만 (인테리어는 좁아서 오브젝트 충돌은 생략, 단순 clamp)
        if (n.currentScene === 'outside') {
          const resolved = { x: newX, z: newZ };
          resolveCollisions(resolved, id);
          n.mesh.position.x = resolved.x;
          n.mesh.position.z = resolved.z;
        } else {
          // 인테리어 안: 벽(±5.5) 안쪽으로만
          n.mesh.position.x = Math.max(-5, Math.min(5, newX));
          n.mesh.position.z = Math.max(-5, Math.min(5, newZ));
        }
        const targetAngle = Math.atan2(dir.x, dir.z);
        n.mesh.rotation.y = targetAngle;
        n.bounce += dt * 10;
        n.mesh.position.y = Math.abs(Math.sin(n.bounce)) * 0.08;
      }
    } else if (n.state === 'idle') {
      n.mesh.position.y = 0;
      n.idleTimer -= dt;
      // 외부에서만 다른 NPC와 대화 상태 진입
      if (n.currentScene === 'outside') {
        Object.entries(npcMeshes).forEach(([otherId, other]) => {
          if (otherId === id) return;
          if (other.currentScene !== 'outside') return;
          const d = n.mesh.position.distanceTo(other.mesh.position);
          if (d < 1.5 && other.state === 'idle' && Math.random() < 0.03) {
            n.state = 'talking';
            other.state = 'talking';
            n.idleTimer = 3; other.idleTimer = 3;
            const angleA = Math.atan2(other.mesh.position.x - n.mesh.position.x, other.mesh.position.z - n.mesh.position.z);
            n.mesh.rotation.y = angleA;
            other.mesh.rotation.y = angleA + Math.PI;
          }
        });
      }
      if (n.idleTimer <= 0) {
        if (n.currentScene === 'outside') {
          const useFav = Math.random() < 0.6;
          const target = useFav ? getFavoriteLocation(npc) : LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
          n.target = target;
          n.targetPos = new THREE.Vector3(target.x + (Math.random()-0.5)*1.5, 0, target.z + (Math.random()-0.5)*1.5);
        } else {
          // 인테리어 안에서 새 목표 (벽 안쪽 랜덤)
          n.targetPos = new THREE.Vector3(
            (Math.random() - 0.5) * 8,
            0,
            (Math.random() - 0.5) * 8
          );
        }
        n.state = 'walking';
      }
    } else if (n.state === 'talking') {
      n.mesh.position.y = Math.sin(performance.now() * 0.004) * 0.05;
      n.idleTimer -= dt;
      if (n.idleTimer <= 0) {
        n.state = 'idle';
        n.idleTimer = 1 + Math.random() * 2;
      }
    }
    
    // 말풍선 위치 업데이트 (항상 표시, 머리 위 추적)
    const vec = new THREE.Vector3();
    vec.copy(n.mesh.position);
    vec.y += 2.2; // 머리 바로 위
    vec.project(camera);
    
    // 카메라 뒤에 있으면 숨김 (clipping space에서 z > 1이면 뒤)
    if (vec.z > 1 || vec.z < -1) {
      n.speechBubbleEl.classList.add('hide');
    } else {
      n.speechBubbleEl.classList.remove('hide');
      const x = (vec.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-vec.y * 0.5 + 0.5) * window.innerHeight;
      n.speechBubbleEl.style.left = x + 'px';
      n.speechBubbleEl.style.top = y + 'px';
    }
  });
}

// =========================================================
// 시간/조명 업데이트
// =========================================================
function updateTimeOfDay(dt) {
  // 낮 시간에만 시간이 자동 흐름 (밤에는 버튼으로)
  if (state.phase === 'day' || state.phase === 'morning') {
    state.timeOfDay += dt * 0.002; // 더 천천히 흐름
    if (state.timeOfDay > 0.78) {
      state.timeOfDay = 0.78; // 저녁에서 멈춤, 밤으로 전환은 버튼
    }
  }
  updateSimulationLighting();
}

// 조명/창문/상단 바 업데이트 — state.timeOfDay 값에 따라
function updateSimulationLighting() {
  const t = state.timeOfDay;
  let skyColor, lightColor, lightIntensity, ambient;
  
  if (t < 0.15) {
    // 한밤
    skyColor = new THREE.Color(0x2a3a5c);
    lightColor = new THREE.Color(0x4a5a8c);
    lightIntensity = 0.2;
    ambient = 0.2;
  } else if (t < 0.28) {
    // 새벽→아침
    const p = (t - 0.15) / 0.13;
    skyColor = new THREE.Color(0x2a3a5c).lerp(new THREE.Color(0xffc896), p);
    lightColor = new THREE.Color(0xff9e5c).lerp(new THREE.Color(0xffb87a), p);
    lightIntensity = 0.2 + p * 0.35;
    ambient = 0.2 + p * 0.25;
  } else if (t < 0.4) {
    const p = (t - 0.28) / 0.12;
    skyColor = new THREE.Color(0xffc896).lerp(new THREE.Color(0xfef3e7), p);
    lightColor = new THREE.Color(0xffb87a).lerp(new THREE.Color(0xfff0d0), p);
    lightIntensity = 0.55 + p * 0.2;
    ambient = 0.45 + p * 0.1;
  } else if (t < 0.6) {
    skyColor = new THREE.Color(0xfef3e7);
    lightColor = new THREE.Color(0xfff0d0);
    lightIntensity = 0.75;
    ambient = 0.55;
  } else if (t < 0.72) {
    const p = (t - 0.6) / 0.12;
    skyColor = new THREE.Color(0xfef3e7).lerp(new THREE.Color(0xffc896), p);
    lightColor = new THREE.Color(0xfff0d0).lerp(new THREE.Color(0xff9e5c), p);
    lightIntensity = 0.75 - p * 0.25;
    ambient = 0.55 - p * 0.1;
  } else if (t < 0.85) {
    const p = (t - 0.72) / 0.13;
    skyColor = new THREE.Color(0xffc896).lerp(new THREE.Color(0x6b4c93), p);
    lightColor = new THREE.Color(0xff9e5c).lerp(new THREE.Color(0x6a5a8c), p);
    lightIntensity = 0.5 - p * 0.25;
    ambient = 0.45 - p * 0.15;
  } else {
    skyColor = new THREE.Color(0x2a3a5c);
    lightColor = new THREE.Color(0x4a5a8c);
    lightIntensity = 0.25;
    ambient = 0.25;
  }
  
  renderer.setClearColor(skyColor);
  scene.fog.color = skyColor;
  sunLight.color = lightColor;
  sunLight.intensity = lightIntensity;
  ambientLight.color = lightColor;
  ambientLight.intensity = ambient;
  
  // 밤에는 창문 빛나기
  const isNight = t < 0.15 || t > 0.85;
  buildings.forEach(b => {
    if (b.userData.windowMat) {
      b.userData.windowMat.emissive = isNight ? new THREE.Color(0xffd580) : new THREE.Color(0x000000);
    }
  });
  
  // 상단 바 업데이트
  let phaseLabel = '☀️ 낮';
  if (t < 0.15) phaseLabel = '🌙 밤';
  else if (t < 0.28) phaseLabel = '🌄 새벽';
  else if (t < 0.4) phaseLabel = '🌅 아침';
  else if (t < 0.6) phaseLabel = '☀️ 낮';
  else if (t < 0.72) phaseLabel = '🌤️ 오후';
  else if (t < 0.85) phaseLabel = '🌇 저녁';
  else phaseLabel = '🌙 밤';
  document.getElementById('day-badge').textContent = `Day ${state.day} · ${phaseLabel}`;
  document.getElementById('time-bar-fill').style.width = (t * 100) + '%';
}

// =========================================================
// 카메라 컨트롤
// =========================================================
let isDragging = false;
let lastMouseX = 0, lastMouseY = 0;
renderer.domElement.addEventListener('mousedown', e => {
  isDragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});
window.addEventListener('mousemove', e => {
  if (!isDragging) return;
  const dx = e.clientX - lastMouseX;
  const dy = e.clientY - lastMouseY;
  // 드래그 시 시뮬레이션 중이면 시네마틱 모드 해제 (자유 카메라로 전환)
  if (state.simulation.active && state.simulation.cameraMode === 'cinematic' && (Math.abs(dx) + Math.abs(dy) > 2)) {
    state.simulation.cameraMode = 'free';
    showNotification('📷 자유 카메라 모드 (자동 추적 해제)');
  }
  cameraAngle -= dx * 0.005;
  cameraPitch = Math.max(0.3, Math.min(Math.PI/2.1, cameraPitch - dy * 0.005));
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  updateCamera();
});
window.addEventListener('mouseup', () => { isDragging = false; });
renderer.domElement.addEventListener('wheel', e => {
  e.preventDefault();
  cameraDist = Math.max(12, Math.min(50, cameraDist + e.deltaY * 0.02));
  updateCamera();
}, { passive: false });

// 터치 지원
let touchStartDist = 0;
renderer.domElement.addEventListener('touchstart', e => {
  if (e.touches.length === 1) {
    isDragging = true;
    lastMouseX = e.touches[0].clientX;
    lastMouseY = e.touches[0].clientY;
  } else if (e.touches.length === 2) {
    isDragging = false;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    touchStartDist = Math.hypot(dx, dy);
  }
});
renderer.domElement.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 1 && isDragging) {
    const dx = e.touches[0].clientX - lastMouseX;
    const dy = e.touches[0].clientY - lastMouseY;
    if (state.simulation.active && state.simulation.cameraMode === 'cinematic' && (Math.abs(dx) + Math.abs(dy) > 2)) {
      state.simulation.cameraMode = 'free';
      showNotification('📷 자유 카메라 모드');
    }
    cameraAngle -= dx * 0.005;
    cameraPitch = Math.max(0.3, Math.min(Math.PI/2.1, cameraPitch - dy * 0.005));
    lastMouseX = e.touches[0].clientX;
    lastMouseY = e.touches[0].clientY;
    updateCamera();
  } else if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy);
    cameraDist = Math.max(12, Math.min(50, cameraDist + (touchStartDist - dist) * 0.05));
    touchStartDist = dist;
    updateCamera();
  }
}, { passive: false });
renderer.domElement.addEventListener('touchend', () => { isDragging = false; });

// NPC 클릭 감지
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let mouseDownPos = null;
renderer.domElement.addEventListener('mousedown', e => {
  mouseDownPos = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener('click', e => {
  if (!mouseDownPos || Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y) > 5) return;
  // 시뮬레이션 중에는 NPC/건물/바닥 클릭 금지 (카메라 드래그는 따로, 허용)
  if (state.simulation.active) return;
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  
  if (state.viewMode === 'interior') {
    // 1) 인테리어 오브젝트 클릭 체크 (침대 등)
    const interiorChildren = [];
    interiorObjects.traverse(obj => { if (obj.isMesh) interiorChildren.push(obj); });
    const objHits = raycaster.intersectObjects(interiorChildren, false);
    if (objHits.length > 0) {
      // 첫 번째 히트에서 부모를 거슬러 올라가 userData.type이 있는 그룹 찾기
      let target = objHits[0].object;
      while (target) {
        if (target.userData?.type === 'bed') {
          handleBedClick();
          return;
        }
        target = target.parent;
      }
      // userData.bedRef 경로 (자식 메시에 심어둔 참조)
      if (objHits[0].object.userData?.bedRef) {
        handleBedClick();
        return;
      }
    }
    // 2) NPC 클릭 (어디서든 가능) — 현재 interior 씬에 있는 NPC만
    const interiorNpcs = Object.values(npcMeshes).filter(n => n.currentScene === 'interior');
    const objects = interiorNpcs.map(n => n.mesh);
    const intersects = raycaster.intersectObjects(objects, true);
    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj && !obj.userData?.npcId) obj = obj.parent;
      if (obj) selectNpc(obj.userData.npcId);
      return;
    }
    // 3) 바닥/오브젝트 아무 데나 클릭 → 유저 이동 (단, 인테리어 오브젝트 '위'로 올라가지 않게 clamp)
    if (state.user.mesh && objHits.length > 0) {
      const point = objHits[0].point;
      const tx = Math.max(-5, Math.min(5, point.x));
      const tz = Math.max(-5, Math.min(5, point.z));
      moveUserTo(tx, tz, {});
    }
    return;
  }
  
  // ========== 동네 뷰 ==========
  
  // 1) NPC 클릭 체크 — 가까우면 즉시 대화, 멀면 자동 접근
  const npcObjects = Object.values(npcMeshes).map(n => n.mesh);
  const npcHits = raycaster.intersectObjects(npcObjects, true);
  if (npcHits.length > 0) {
    let obj = npcHits[0].object;
    while (obj && !obj.userData?.npcId) obj = obj.parent;
    if (obj) {
      const npcId = obj.userData.npcId;
      const dist = distanceToNpc(npcId);
      if (dist <= INTERACTION_RANGE) {
        // 가까움 → 바로 대화
        selectNpc(npcId);
      } else {
        // 멀음 → 자동으로 다가감 (도착 후 대화 시작)
        const npc = state.npcs.find(n => n.id == npcId);
        const name = npc?.name || 'NPC';
        showNotification(`🏃 ${name}에게 다가가는 중...`);
        const npcMesh = npcMeshes[npcId].mesh;
        moveUserTo(npcMesh.position.x, npcMesh.position.z, {
          stopDistance: INTERACTION_RANGE * 0.85, // 살짝 안쪽에 멈춤
          pendingNpcId: npcId,
          onArrive: (arrivedNpcId) => {
            // 도착 시 NPC가 여전히 근접 범위 안에 있으면 대화 시작
            if (distanceToNpc(arrivedNpcId) <= INTERACTION_RANGE) {
              selectNpc(arrivedNpcId);
            } else {
              showNotification(`${name}이(가) 이동했어요. 다시 시도해주세요.`);
            }
          },
        });
      }
      return;
    }
  }
  
  // 2) 건물 클릭 체크 — 근접 시 진입, 멀면 자동 접근
  const buildingHits = raycaster.intersectObjects(buildings, true);
  if (buildingHits.length > 0) {
    let obj = buildingHits[0].object;
    while (obj && obj.userData?.type !== 'building') obj = obj.parent;
    if (obj && obj.userData?.loc) {
      const loc = obj.userData.loc;
      // 문이 있으면 문으로, 없으면 건물 중심 (유저 집은 문이 있어도 건물 중심으로 처리하면 충돌)
      const entryX = loc.door ? loc.door.x : loc.x;
      const entryZ = loc.door ? loc.door.z : loc.z;
      if (state.user.mesh) {
        const dx = entryX - state.user.mesh.position.x;
        const dz = entryZ - state.user.mesh.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist <= 1.2) {
          // 문 근처 도착 → 바로 진입
          enterInterior(loc);
        } else {
          showNotification(`🚪 ${loc.name} 문으로 이동 중...`);
          moveUserTo(entryX, entryZ, {
            stopDistance: 0.5,
            onArrive: () => enterInterior(loc),
          });
        }
      } else {
        enterInterior(loc);
      }
      return;
    }
  }
  
  // 3) 바닥(지면) 클릭 체크 → 유저 이동
  if (state.user.mesh) {
    const groundHits = raycaster.intersectObject(ground, false);
    if (groundHits.length > 0) {
      const point = groundHits[0].point;
      // 월드 경계 대략 제한
      const clampedX = Math.max(-19, Math.min(19, point.x));
      const clampedZ = Math.max(-19, Math.min(19, point.z));
      moveUserTo(clampedX, clampedZ);
    }
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// =========================================================
// 게임 로직
// =========================================================
