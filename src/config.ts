import * as THREE from 'three';

export const translations:  { [lang: string]: { [key: string]: string } } =  {
  en: {
    history_title: "Ride History",
    table_track: "Track",
    table_score: "Best Score",
    table_rank: "Rank",
    btn_close: "Close",
    leaderboard_title: "Leaderboard",
    leaderboard_soon: "This section will appear in future updates!",
    tutorial_title: "How to Play",
    tutorial_desc_1: "Press and **HOLD** the left or right side of the screen to steer the ship.",
    tutorial_desc_2: "Landscape mode is recommended.",
    tutorial_btn_ok: "Got it!",
    claim_title: "Claim Rewards",
    claim_desc: "The ability to claim rewards in crypto tokens will appear in the future!",
    warning_title: "Warning",
    warning_text: "High-intensity visual effects and flashing lights ahead. If you feel discomfort or fatigue, please stop playing.",
    btn_start: "Start",
    total_balance: "Total Balance:",
    btn_claim: "Claim",
    start_prompt: "Enter song name to start",
    start_vpn: "(VPN might be required)",
    search_placeholder: "Artist - Track Name...",
    or: "OR",
    btn_choose_file: "Choose File",
    btn_history: "History",
    btn_leaders: "Leaders",
    loading_wait: "Please wait",
    loading_analysis: "Analyzing track...",
    hud_score: "Score:",
    btn_pause: "pause",
    pause_title: "Paused",
    btn_resume: "Resume",
    btn_menu: "Main Menu",
    end_title: "Ride Complete!",
    end_score: "Final Score:",
    loading_track: "Loading: ",
    error_load: "Error loading assets. Please refresh.",
    error_process: "Error processing audio file. Please try another.",
    error_server: "Server could not find video: ",
    error_general: "An error occurred. Please try again or use a local file.",
  },
  ru: {
    history_title: "История заездов",
    table_track: "Трек",
    table_score: "Лучший счет",
    table_rank: "Ранг",
    btn_close: "Закрыть",
    leaderboard_title: "Таблица лидеров",
    leaderboard_soon: "Этот раздел появится в будущих обновлениях!",
    tutorial_title: "Как играть",
    tutorial_desc_1: "Нажмите и <strong>УДЕРЖИВАЙТЕ</strong> левую или правую часть экрана, чтобы управлять кораблем.",
    tutorial_desc_2: "Рекомендуется использовать горизонтальное положение устройства.",
    tutorial_btn_ok: "Понятно!",
    claim_title: "Получить награду",
    claim_desc: "Возможность получать награды в виде криптовалютных токенов появится в будущем!",
    warning_title: "Внимание",
    warning_text: "Впереди высокоинтенсивные визуальные эффекты и вспышки света. При ощущении дискомфорта, прервите игру.",
    btn_start: "Начать",
    total_balance: "Общий баланс:",
    btn_claim: "Claim",
    start_prompt: "Введите название песни, чтобы начать",
    start_vpn: "(Может потребоваться VPN)",
    search_placeholder: "Исполнитель - Название...",
    or: "ИЛИ",
    btn_choose_file: "Выбрать файл",
    btn_history: "История",
    btn_leaders: "Лидеры",
    loading_wait: "Пожалуйста, подождите",
    loading_analysis: "Анализ трека...",
    hud_score: "Счет:",
    btn_pause: "пауза",
    pause_title: "Пауза",
    btn_resume: "Продолжить",
    btn_menu: "Главное меню",
    end_title: "Заезд завершен!",
    end_score: "Итоговый счет:",
    loading_track: "Загрузка: ",
    error_load: "Ошибка загрузки ассетов. Пожалуйста, обновите страницу.",
    error_process: "Произошла ошибка при обработке аудиофайла. Попробуйте другой.",
    error_server: "Сервер не смог найти видео: ",
    error_general: "Произошла ошибка. Попробуйте еще раз или выберите локальный файл.",
  }
};
export const SketchShader =  {
  uniforms: {
    'tDiffuse': { value: null },
    'resolution': { value: new THREE.Vector2() }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    varying vec2 vUv;

    void main() {
      vec2 texel = vec2( 1.0 / resolution.x, 1.0 / resolution.y );

      // Ядро оператора Собеля для определения границ
      const mat3 Gx = mat3( -1, -2, -1, 0, 0, 0, 1, 2, 1 );
      const mat3 Gy = mat3( -1, 0, 1, -2, 0, 2, -1, 0, 1 );

      // Получаем значения яркости соседних пикселей
      float tx0y0 = texture2D( tDiffuse, vUv + texel * vec2( -1, -1 ) ).r;
      float tx0y1 = texture2D( tDiffuse, vUv + texel * vec2( -1, 0 ) ).r;
      float tx0y2 = texture2D( tDiffuse, vUv + texel * vec2( -1, 1 ) ).r;
      float tx1y0 = texture2D( tDiffuse, vUv + texel * vec2( 0, -1 ) ).r;
      float tx1y1 = texture2D( tDiffuse, vUv + texel * vec2( 0, 0 ) ).r;
      float tx1y2 = texture2D( tDiffuse, vUv + texel * vec2( 0, 1 ) ).r;
      float tx2y0 = texture2D( tDiffuse, vUv + texel * vec2( 1, -1 ) ).r;
      float tx2y1 = texture2D( tDiffuse, vUv + texel * vec2( 1, 0 ) ).r;
      float tx2y2 = texture2D( tDiffuse, vUv + texel * vec2( 1, 1 ) ).r;

      mat3 I;
      I[0] = vec3( tx0y0, tx0y1, tx0y2 );
      I[1] = vec3( tx1y0, tx1y1, tx1y2 );
      I[2] = vec3( tx2y0, tx2y1, tx2y2 );
      
      // Вычисляем градиент (насколько сильно меняется яркость)
      float Gx_val = dot( Gx[0], I[0] ) + dot( Gx[1], I[1] ) + dot( Gx[2], I[2] );
      float Gy_val = dot( Gy[0], I[0] ) + dot( Gy[1], I[1] ) + dot( Gy[2], I[2] );
      float G = sqrt( pow( Gx_val, 2.0 ) + pow( Gy_val, 2.0 ) );

      // Если градиент больше порога, значит это контур
      if ( G > 0.25 ) { 
        gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 ); // Рисуем контур черным
      } else {
        gl_FragColor = vec4( 1.0, 1.0, 1.0, 1.0 ); // Все остальное - белым
      }
    }
  `
};
export const RailEqualizerMaterial =  {
  uniforms: {
    uBass: { value: 0.0 },
    uMid: { value: 0.0 },
    uTreble: { value: 0.0 },
    uTime: { value: 0.0 },
    emissive: { value: new THREE.Color(0x00bfff) },
    emissiveIntensity: { value: 1.0 }
  },

  vertexShader: `
    uniform float uBass;
    uniform float uMid;
    uniform float uTime;
    uniform float uTreble;
    
    // Varying для передачи нормали во фрагментный шейдер
    varying vec3 vNormal;
    
    void main() {
      vNormal = normal;
      
      const float BASS_INFLUENCE = 1.4;
      const float MID_WAVE_SPEED = 0.5;
      const float TREBLE_FLICKER = 0.1;
      
      float pseudoRandom = fract(sin(dot(position.xyz, vec3(12.9898, 78.233, 151.7182))) * 43758.5453);
      
      float wave = sin(position.z * uMid * MID_WAVE_SPEED + uTime * 5.0);
      
      float amplitude = uBass * BASS_INFLUENCE;
      
      float flicker = (pseudoRandom - 0.5) * uTreble * TREBLE_FLICKER;
      
      float displacement = amplitude * wave + flicker;
      
      vec3 newPosition = position + normal * displacement;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
    }
  `,

  fragmentShader: `
    uniform vec3 emissive;
    uniform float emissiveIntensity;
    varying vec3 vNormal;
    
    void main() {
      float light = clamp(dot(vNormal, vec3(0.5, 0.5, 1.0)), 0.0, 1.0);
      gl_FragColor = vec4(emissive * (light + emissiveIntensity), 1.0);
    }
  `
};
export 

enum EnvironmentState { SPACE, CITY, SOLAR_SYSTEM }
export const STYLE_RANKS =  [
  { name: 'Dismal', rank: 'D', hitsNeeded: 5, multiplier: 2, image: '/assets/images/rank_d.png' },
  { name: 'Crazy', rank: 'C', hitsNeeded: 10, multiplier: 3, image: '/assets/images/rank_c.png' },
  { name: 'Badass', rank: 'B', hitsNeeded: 15, multiplier: 4, image: '/assets/images/rank_b.png' },
  { name: 'Apocalyptic', rank: 'A', hitsNeeded: 20, multiplier: 5, image: '/assets/images/rank_a.png' },
  { name: 'Savage!', rank: 'S', hitsNeeded: 30, multiplier: 6, image: '/assets/images/rank_s.png' },
  { name: 'Sick Skills!', rank: 'SS', hitsNeeded: 40, multiplier: 7, image: '/assets/images/rank_ss.png' },
  { name: 'Smokin\' Sexy Style!', rank: 'SSS', hitsNeeded: 50, multiplier: 8, image: '/assets/images/rank_sss.png' }
];
export const NUM_SCREENS =  4;
export const MAX_BOLTS_IN_POOL =  50;
export const NORMAL_SKY_COLOR =  new THREE.Color(0x00aaff);
export const MAX_HYPERSPACE_JUMPS =  5;
export const LANE_WIDTH =  5;
export const NUM_LANES =  3;
export const LANE_POSITIONS =  [-(NUM_LANES - 1) / 2 * LANE_WIDTH, 0, (NUM_LANES - 1) / 2 * LANE_WIDTH];
export const ANALYSIS_CHUNK_SAMPLES =  4096;
export const BLOCK_VIEW_DISTANCE =  0.1;
export const STAR_COUNT =  40000;
export const STAR_POSITIONS =  new Float32Array(STAR_COUNT * 3);

for (let i = 0; i < STAR_COUNT; i++) {
  const i3 = i * 3;
  STAR_POSITIONS[i3 + 0] = (Math.random() - 0.5) * 4000;
  STAR_POSITIONS[i3 + 1] = (Math.random() - 0.5) * 3000;
  STAR_POSITIONS[i3 + 2] = (Math.random() - 0.5) * 4000;
}
export const ENTIRE_SCENE =  0;
export const BLOOM_SCENE =  1;
export const SKETCH_MODE_DURATION =  10.0;
export const FRAME_POOL_SIZE =  30;
export const TUNNEL_SEGMENT_POOL_SIZE =  50;
export const CHUNK_SIZE =  2000;
export const NUM_CHUNKS_AXIS =  3;
export const MAX_POINTS_PER_BOLT =  20;
export const MIN_BLOCK_SPEED_FACTOR =  -0.1;
export const MAX_BLOCK_SPEED_FACTOR =  0.8;