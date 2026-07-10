import * as THREE from 'three';
import * as config from './config';

export const state: any = {};

state.currentLang =  'en';
state._reusableVector1 =  new THREE.Vector3();
state._reusableVector2 =  new THREE.Vector3();
state._reusableVector3 =  new THREE.Vector3();
state._reusableVector4 =  new THREE.Vector3();
state._reusableFrame =  {
  point: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  binormal: new THREE.Vector3()
};
state.currentEnvironment =  config.EnvironmentState.SPACE;
state.spaceGroup = undefined;
state.cityBackgroundSphere = undefined;
state.solarSystemGroup = undefined;
state.planets =  [];
state.scene = undefined;
state.camera = undefined;
state.renderer = undefined;
state.composer = undefined;
state.bloomComposer = undefined;
state.player = undefined;
state.trackGroup = undefined;
state.backgroundSphere = undefined;
state.nebulaParticles = undefined;
state.normalStarfield = undefined;
state.hyperspaceStreaks = undefined;
state.meteorShower = undefined;
state.positiveBurst = undefined;
state.sketchPass = undefined;
state.audioContext = undefined;
state.analyser = undefined;
state.source = undefined;
state.frequencyData = undefined;
state.animationFrameId = undefined;
state.score =  0;
state.cityGroup = undefined;
state.buildingMaterial = undefined;
state.videoScreensGroup = undefined;
state.videoElements =  [];
state.isARankEffectActive =  false;
state.videoUrl =  '';
state.equalizerGroup = undefined;
state.trackCurve = undefined;
state.trackFrames =  [];
state.playerProgress =  0;
state.lastPlayerProgress =  0;
state.songData =  null;
state.gameStarted =  false;
state.isPaused =  false;
state.consecutiveHits =  0;
state.lastHitTime =  0;
state.lastDecayTime =  0;
state.currentRankIndex =  -1;
state.previousRankIndex =  -1;
state.targetPlayerLane =  1;
state.actualPlayerLane =  1;
state.keyState =  { left: false, right: false };
state.timeInRedZone =  0;
state.isGpuPrewarmed =  false;
state.activeTransition =  {
  inProgress: false,
  onComplete: () => {}
};
state.currentTrackName =  '';
state.currentVideoId =  '';
state.maxCombo =  0;
state.totalMisses =  0;
state.rankHistory =  [];
state.menuMusic =  null;
state.menuActive =  false;
state.telegramUserId =  null;
state.cityEnvironmentInitialized =  false;
state.solarSystemEnvironmentInitialized =  false;
state.currentColor =  new THREE.Color(0x00bfff);
state.lerpedEnergy =  0;
state.hyperspaceEffect =  { active: false, timer: 0, duration: 1.5 };
state.lastHyperspaceTriggerTime =  -Infinity;
state.hyperspaceJumpCount =  0;
state.shakeTime =  0;
state.shakeIntensity =  0;
state.storm =  {
  active: false,
  lightningFlash: null as THREE.PointLight | null,
  ambientLight: null as THREE.AmbientLight | null,
  lastFlashTime: 0,
  nextFlashDelay: 0,
  thunderSounds: [] as HTMLAudioElement[]
};
state.lightningBolts =  [];
state._lightningPoints =  [];
state.currentSkyColor =  config.NORMAL_SKY_COLOR.clone();
state.fadeOutPlane = undefined;
state.bloomLayer =  new THREE.Layers();
state.bloomLayer.set(config.BLOOM_SCENE);
state.allBlocks =  [];
state.colorBlockPool =  [];
state.obstaclePool =  [];
state.isSketchModeActive =  false;
state.sketchModeTimer =  0;
state.specialEventObjects =  [];
state.wormholePool =  [];
state.nextWormholeSpawnTime =  0;
state.hasSketchModeBeenTriggeredThisSong =  false;
state.circularFramesGroup = undefined;
state.tunnelGroup = undefined;
state.circularFrames =  [];
state.tunnels =  [];
state.framePool =  [];
state.tunnelSegmentPool =  [];
state.cityFadeIn =  { active: false, progress: 0, duration: 1.5 };
state.systemAudioCtx =  null;
state.gameMusicGain =  null;
state.audioBuffers =  {};
state.menuMusicSource =  null;
state.menuMusicGain =  null;
state.cityChunks =  [];
state.searchTimeout = undefined;
state.clock =  new THREE.Clock();
state._screenPos =  new THREE.Vector3();
state._lookAtMatrix =  new THREE.Matrix4();
state._parallelQuat =  new THREE.Quaternion();
state._lookAtQuat =  new THREE.Quaternion();