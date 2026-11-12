/* Pixel / voxel field background. Self-written WebGL, no CDN.
   Method sources (not copied code): Inigo Quilez on fBM, domain warping, and dynamic clouds.
   Contrast and time scale are raised vs the pixel.html study so the field is easier to see.
   Mouse parallax is a slow UV follow (~0.9s), disabled on touch and reduced motion. */
(function () {
  var FRAG = "precision highp float;\nuniform vec2 u_res;\nuniform float u_time;\nuniform float u_dark;\nuniform vec2 u_mouse;\n\nfloat hash21(vec2 p) {\n  p = fract(p * vec2(123.34, 456.21));\n  p += dot(p, p + 45.32);\n  return fract(p.x * p.y);\n}\nfloat vnoise(vec2 p) {\n  vec2 i = floor(p);\n  vec2 f = fract(p);\n  vec2 u = f * f * (3.0 - 2.0 * f);\n  float a = hash21(i);\n  float b = hash21(i + vec2(1.0, 0.0));\n  float c = hash21(i + vec2(0.0, 1.0));\n  float d = hash21(i + vec2(1.0, 1.0));\n  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);\n}\nfloat fbm5(vec2 p) {\n  float s = 0.0;\n  float a = 0.5;\n  for (int i = 0; i < 5; i++) {\n    s += a * vnoise(p);\n    p *= 2.02;\n    a *= 0.5;\n  }\n  return s;\n}\nfloat bayer4(vec2 fragCoord) {\n  vec2 f = mod(floor(fragCoord), 4.0);\n  float x = f.x;\n  float y = f.y;\n  float v;\n  if (y < 0.5) {\n    if (x < 0.5) v = 0.0;\n    else if (x < 1.5) v = 8.0;\n    else if (x < 2.5) v = 2.0;\n    else v = 10.0;\n  } else if (y < 1.5) {\n    if (x < 0.5) v = 12.0;\n    else if (x < 1.5) v = 4.0;\n    else if (x < 2.5) v = 14.0;\n    else v = 6.0;\n  } else if (y < 2.5) {\n    if (x < 0.5) v = 3.0;\n    else if (x < 1.5) v = 11.0;\n    else if (x < 2.5) v = 1.0;\n    else v = 9.0;\n  } else {\n    if (x < 0.5) v = 15.0;\n    else if (x < 1.5) v = 7.0;\n    else if (x < 2.5) v = 13.0;\n    else v = 5.0;\n  }\n  return v / 16.0;\n}\n\nvoid main() {\n  vec2 res = u_res;\n  float dark = u_dark;\n  float cell = max(4.0, min(res.x, res.y) / 180.0);\n  vec2 gid = floor(gl_FragCoord.xy / cell);\n  vec2 p = gid / (res / cell);\n  p.x *= res.x / res.y;\n  p += u_mouse * 0.16;\n  float t = u_time * 0.078;\n  float n = fbm5(p * 1.55 + vec2(t * 0.95, t * 0.40));\n  float m = fbm5(p * 2.85 + vec2(-t * 0.58, t * 0.70) + 17.2);\n  float v = n * 0.68 + m * 0.32;\n  v += (bayer4(gid) - 0.5) * 0.055;\n  v = clamp(v, 0.0, 1.0);\n  v = clamp((v - 0.5) * 1.28 + 0.5, 0.0, 1.0);\n  float q = floor(v * 5.0 + 0.0001) / 5.0;\n  vec3 c0, c1, c2, c3, c4;\n  if (dark > 0.5) {\n    c0 = vec3(0.012, 0.018, 0.024);\n    c1 = vec3(0.030, 0.095, 0.125);\n    c2 = vec3(0.070, 0.230, 0.270);\n    c3 = vec3(0.150, 0.420, 0.445);\n    c4 = vec3(0.255, 0.600, 0.555);\n  } else {\n    c0 = vec3(0.980, 0.968, 0.935);\n    c1 = vec3(0.780, 0.885, 0.870);\n    c2 = vec3(0.500, 0.730, 0.750);\n    c3 = vec3(0.800, 0.670, 0.520);\n    c4 = vec3(0.400, 0.590, 0.555);\n  }\n  vec3 col = mix(c0, c1, smoothstep(0.0, 0.28, q));\n  col = mix(col, c2, smoothstep(0.22, 0.52, q));\n  col = mix(col, c3, smoothstep(0.48, 0.78, q));\n  col = mix(col, c4, smoothstep(0.72, 1.0, q) * 0.85);\n  vec2 mid = vec2(0.50, 0.42) + u_mouse * 0.08;\n  float vign = smoothstep(1.20, 0.22, length((gl_FragCoord.xy / res - mid) * vec2(1.1, 1.0)));\n  col = mix(c0, col, 0.90 + 0.10 * vign);\n  gl_FragColor = vec4(col, 1.0);\n}\n";
  var canvas = document.getElementById("bg-canvas");
  var root = document.documentElement;

  function fail() {
    root.classList.remove("has-webgl");
    root.classList.add("no-webgl");
    window.__bg = {
      ok: false,
      setTime: function () {},
      getTime: function () { return 0; },
      setTheme: function () {},
      setMouse: function () {},
      pause: function () {},
      resume: function () {}
    };
  }

  if (!canvas) { fail(); return; }

  var lowPower = false;
  try {
    if (navigator.deviceMemory && navigator.deviceMemory <= 2) lowPower = true;
  } catch (e) {}
  if (lowPower) { fail(); return; }

  var gl = canvas.getContext("webgl", { alpha: false, antialias: false, preserveDrawingBuffer: true })
        || canvas.getContext("experimental-webgl", { alpha: false, antialias: false, preserveDrawingBuffer: true });
  if (!gl) { fail(); return; }

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }
  var vs = compile(gl.VERTEX_SHADER, "attribute vec2 a_pos; void main(){ gl_Position = vec4(a_pos,0.0,1.0); }");
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { fail(); return; }
  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "a_pos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
    fail();
    return;
  }
  gl.useProgram(prog);
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  var uRes = gl.getUniformLocation(prog, "u_res");
  var uTime = gl.getUniformLocation(prog, "u_time");
  var uDark = gl.getUniformLocation(prog, "u_dark");
  var uMouse = gl.getUniformLocation(prog, "u_mouse");

  var darkVal = root.getAttribute("data-theme") === "light" ? 0 : 1;
  var timeVal = 0;
  var raf = 0;
  var last = performance.now();
  var paused = true;
  var mx = 0, my = 0, tx = 0, ty = 0;
  var parallax = true;

  function motionAllowed() {
    if (root.getAttribute("data-motion") === "off") return false;
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches && root.getAttribute("data-motion") !== "on") return false;
    } catch (e) {}
    return true;
  }
  function parallaxAllowed() {
    if (!motionAllowed()) return false;
    try {
      if (window.matchMedia("(pointer: coarse)").matches) return false;
    } catch (e) {}
    return parallax;
  }

  function size() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    var h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  function draw() {
    size();
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, timeVal);
    gl.uniform1f(uDark, darkVal);
    gl.uniform2f(uMouse, mx, my);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function loop(now) {
    raf = 0;
    if (!paused) {
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      timeVal += dt;
      if (parallaxAllowed()) {
        var follow = 1 - Math.exp(-dt / 0.9);
        mx += (tx - mx) * follow;
        my += (ty - my) * follow;
      }
      draw();
      raf = requestAnimationFrame(loop);
    }
  }
  function stop() {
    paused = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function play() {
    if (!motionAllowed()) {
      stop();
      draw();
      return;
    }
    if (document.hidden) return;
    paused = false;
    last = performance.now();
    if (!raf) raf = requestAnimationFrame(loop);
  }

  window.addEventListener("resize", function () { draw(); });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
    else play();
  });
  document.addEventListener("pointermove", function (e) {
    if (e.pointerType === "touch") {
      parallax = false;
      tx = ty = 0;
      return;
    }
    if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    if (!parallaxAllowed()) return;
    tx = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
    ty = -((e.clientY / Math.max(1, window.innerHeight)) * 2 - 1);
  }, { passive: true });

  root.classList.remove("no-webgl");
  root.classList.add("has-webgl");
  window.__bg = {
    ok: true,
    setTime: function (t) { timeVal = t; draw(); },
    getTime: function () { return timeVal; },
    setTheme: function (d) { darkVal = d ? 1 : 0; draw(); },
    setMouse: function (x, y) { mx = tx = x; my = ty = y; draw(); },
    pause: function () { stop(); draw(); },
    resume: play
  };
  size();
  draw();
  play();
})();
