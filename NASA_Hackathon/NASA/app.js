import * as THREE from "https://cdn.skypack.dev/three@0.136.0";
import * as TWEEN from "https://cdn.skypack.dev/@tweenjs/tween.js";

import { OrbitControls } from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/controls/OrbitControls";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/renderers/CSS2DRenderer.js";

let rad = 4;
let scene = new THREE.Scene();
let camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1, 2000);
camera.position.set(0.5, 0.5, 1).setLength(14);
let renderer = new THREE.WebGLRenderer({
  antialias: true,
});
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0xffffff);
document.body.appendChild(renderer.domElement);

let labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = "absolute";
labelRenderer.domElement.style.top = "0px";
document.body.appendChild(labelRenderer.domElement);

window.addEventListener("resize", onWindowResize);

let controls = new OrbitControls(camera, labelRenderer.domElement);
controls.enablePan = false;
controls.minDistance = 6;
controls.maxDistance = 15;
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed *= 0.5;

let globalUniforms = {
  time: { value: 0 },
};

// <GLOBE>
const globeMaterial = new THREE.MeshBasicMaterial({
  map: new THREE.TextureLoader().load("earth.jpeg"),
});
const globeGeometry = new THREE.SphereGeometry(rad, 32, 16);
const globe = new THREE.Mesh(globeGeometry, globeMaterial);
scene.add(globe);
// </GLOBE>

// <Markers>
const markerCount = 3;
let markerInfo = []; // information on markers
let gMarker = new THREE.PlaneGeometry();
let mMarker = new THREE.MeshBasicMaterial({
  color: 0xff3232,
  onBeforeCompile: (shader) => {
    shader.uniforms.time = globalUniforms.time;
    shader.vertexShader = `
            attribute float phase;
            varying float vPhase;
            ${shader.vertexShader}
            `.replace(
      `#include <begin_vertex>`,
      `#include <begin_vertex>
        vPhase = phase; // de-synch of ripples
        `
    );
    //console.log(shader.vertexShader);
    shader.fragmentShader = `
            uniform float time;
            varying float vPhase;
                ${shader.fragmentShader}
            `.replace(
      `vec4 diffuseColor = vec4( diffuse, opacity );`,
      `
            vec2 lUv = (vUv - 0.5) * 2.;
            float val = 0.;
            float lenUv = length(lUv);
            val = max(val, 1. - step(0.25, lenUv)); // central circle
            val = max(val, step(0.4, lenUv) - step(0.5, lenUv)); // outer circle
            float tShift = fract(time * 0.5 + vPhase);
            val = max(val, step(0.4 + (tShift * 0.6), lenUv) - step(0.5 + (tShift * 0.5), lenUv)); // ripple
            if (val < 0.5) discard;
            vec4 diffuseColor = vec4( diffuse, opacity );`
    );
    //console.log(shader.fragmentShader)
  },
});
mMarker.defines = { USE_UV: " " }; // needed to be set to be able to work with UVs
let markers = new THREE.InstancedMesh(gMarker, mMarker, markerCount);
let dummy = new THREE.Object3D();
let phase = [];

let markersData = [
  /*{
    position: new THREE.Vector3(0.2, 2.7, 3),
    mag: "Chicago",
  },*/
  { position: new THREE.Vector3(0, 0, 4), mag: "New York" },
  { position: new THREE.Vector3(4, 0, 0), mag: "Tokyo" },
  { position: new THREE.Vector3(2.45, 3.2, 0), mag: "London" },
];

for (let i = 0; i < markerCount; i++) {
  dummy.position.copy(markersData[i].position);
  dummy.lookAt(dummy.position.clone().setLength(rad + 1));
  dummy.updateMatrix();
  markers.setMatrixAt(i, dummy.matrix);
  phase.push(Math.random());

  markerInfo.push({
    id: i + 1,
    mag: markersData[i].mag,
    crd: dummy.position.clone(),
  });
}

gMarker.setAttribute(
  "phase",
  new THREE.InstancedBufferAttribute(new Float32Array(phase), 1)
);

scene.add(markers);
// </Markers>

// <Label>
let labelDiv = document.getElementById("markerLabel");
let closeBtn = document.getElementById("closeButton");
closeBtn.addEventListener("pointerdown", (event) => {
  labelDiv.classList.add("hidden");
  const targetPosition = new THREE.Vector3();
  targetPosition.copy(intersections[0].point);
  targetPosition.normalize().multiplyScalar(camera.position.length() + 5);
  new TWEEN.Tween(camera.position)
    .to(targetPosition, 1000)
    .easing(TWEEN.Easing.Cubic.Out)
    .start();
  controls.autoRotate = true;
});
let label = new CSS2DObject(labelDiv);
label.userData = {
  cNormal: new THREE.Vector3(),
  cPosition: new THREE.Vector3(),
  mat4: new THREE.Matrix4(),
  trackVisibility: () => {
    // the closer to the edge, the less opacity
    let ud = label.userData;
    ud.cNormal
      .copy(label.position)
      .normalize()
      .applyMatrix3(globe.normalMatrix);
    ud.cPosition
      .copy(label.position)
      .applyMatrix4(
        ud.mat4.multiplyMatrices(camera.matrixWorldInverse, globe.matrixWorld)
      );
    let d = ud.cPosition.negate().normalize().dot(ud.cNormal);
    d = smoothstep(0.2, 0.7, d);
    label.element.style.opacity = d;

    // https://github.com/gre/smoothstep/blob/master/index.js
    function smoothstep(min, max, value) {
      var x = Math.max(0, Math.min(1, (value - min) / (max - min)));
      return x * x * (3 - 2 * x);
    }
  },
};
scene.add(label);
// </Label>

// <Interaction>
let pointer = new THREE.Vector2();
let raycaster = new THREE.Raycaster();
let intersections;
let divID = document.getElementById("idNum");
let divMag = document.getElementById("magnitude");
let divCrd = document.getElementById("coordinates");
window.addEventListener("pointerdown", (event) => {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  intersections = raycaster.intersectObject(markers).filter((m) => {
    return m.uv.subScalar(0.5).length() * 2 < 0.25; // check, if we're in the central circle only
  });
  //console.log(intersections);
  if (intersections.length > 0) {
    let iid = intersections[0].instanceId;
    let mi = markerInfo[iid];
    divID.innerHTML = `ID: <b>${mi.id}</b>`;
    divMag.innerHTML = `Mag: <b>${mi.mag}</b>`;
    label.position.copy(mi.crd);
    label.element.animate(
      [
        {
          width: "0px",
          height: "0px",
          marginTop: "0px",
          marginLeft: "0px",
        },
        {
          width: "230px",
          height: "50px",
          marginTop: "-25px",
          maginLeft: "120px",
        },
      ],
      {
        duration: 250,
      }
    );
    label.element.classList.remove("hidden");
    const targetPosition = new THREE.Vector3();
    targetPosition.copy(intersections[0].point);
    targetPosition.normalize().multiplyScalar(camera.position.length() - 5);
    new TWEEN.Tween(camera.position)
      .to(targetPosition, 1500)
      .easing(TWEEN.Easing.Cubic.Out)
      .start();
    controls.autoRotate = false;
  }
});
// </Interaction>

let clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  let t = clock.getElapsedTime();
  globalUniforms.time.value = t;
  label.userData.trackVisibility();
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  TWEEN.update();
});

function onWindowResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
}
