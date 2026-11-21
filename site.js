"use strict";

(() => {
  const one = (selector, scope = document) => scope.querySelector(selector);
  const all = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const zone = "Europe/Berlin";
  const coordinates = { latitude: 49.2203, longitude: 8.3709 };
  const clockFormatter = new Intl.DateTimeFormat("de-DE", {
    timeZone: zone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  });
  const monthFormatter = new Intl.DateTimeFormat("de-DE", { timeZone: zone, month: "long" });

  function localClock(date) {
    const parts = {};
    for (const part of clockFormatter.formatToParts(date)) {
      if (part.type !== "literal") parts[part.type] = Number(part.value);
    }
    parts.minutes = parts.hour * 60 + parts.minute;
    return parts;
  }

  function timeLabel(minutes) {
    return [Math.floor(minutes / 60), minutes % 60]
      .map(part => String(part).padStart(2, "0"))
      .join(":");
  }

  // Use the calendar date in Germersheim even when the visitor is in another zone.
  function daylightFor({ year, month, day }) {
    const radians = Math.PI / 180;
    const toDegrees = 180 / Math.PI;
    const julianEpoch = 2440587.5;
    const julian2000 = 2451545;
    const days = Date.UTC(year, month - 1, day, 12) / 86400000 + julianEpoch - julian2000;
    const west = -coordinates.longitude / 360;
    const cycle = Math.round(days - 0.0009 - west);
    const solarDay = cycle + 0.0009 + west;
    const anomaly = (357.5291 + 0.98560028 * solarDay) * radians;
    const correction = 1.9148 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly) + 0.0003 * Math.sin(3 * anomaly);
    const ecliptic = anomaly + (correction + 102.9372 + 180) * radians;
    const declination = Math.asin(Math.sin(ecliptic) * Math.sin(23.4397 * radians));
    const latitude = coordinates.latitude * radians;
    const transit = julian2000 + solarDay + 0.0053 * Math.sin(anomaly) - 0.0069 * Math.sin(2 * ecliptic);
    const angle = (Math.sin(-0.833 * radians) - Math.sin(latitude) * Math.sin(declination)) /
      (Math.cos(latitude) * Math.cos(declination));
    const halfDay = (Math.acos(Math.max(-1, Math.min(1, angle))) * toDegrees) / 360;
    function toMinutes(julian) {
      return localClock(new Date((julian - julianEpoch) * 86400000)).minutes;
    }
    return { sunrise: toMinutes(transit - halfDay), sunset: toMinutes(transit + halfDay) };
  }

  const weekRows = all(".week [data-day]");
  const weeklySchedule = new Map(weekRows.map(row => {
    const times = one("dd", row).textContent.match(/\d{1,2}:\d{2}/g);
    const minutes = times.map(time => {
      const [hour, minute] = time.split(":").map(Number);
      return hour * 60 + minute;
    });
    return [Number(row.dataset.day), { start: minutes[0], end: minutes[1] }];
  }));
  const chartPercent = minutes => Math.min(100, Math.max(0, (minutes - 300) / 1140 * 100));
  function positionBar(bar, start, end) {
    bar.style.left = chartPercent(start) + "%";
    bar.style.width = (chartPercent(end) - chartPercent(start)) + "%";
  }

  let daylightKey = "";
  let sun = null;
  let weather = null;
  let nextWeatherFetch = 0;

  function updateLocalInfo(now = new Date()) {
    const local = localClock(now);
    const dateKey = [local.year, local.month, local.day].join("-");
    const weekday = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
    const today = weeklySchedule.get(weekday);
    const tomorrow = weeklySchedule.get((weekday + 1) % 7);
    if (dateKey !== daylightKey) {
      daylightKey = dateKey;
      sun = daylightFor(local);
      one("#season").textContent = "Draußen " + monthFormatter.format(now) + ".";
      one("#summer-word").textContent = (local.month >= 6 && local.month <= 8) ? "immer Sommer." : "Sommer.";
      all("[data-year]").forEach(el => { el.textContent = String(local.year); });
      weekRows.forEach(row => {
        const current = Number(row.dataset.day) === weekday;
        row.classList.toggle("today", current);
        const previousBadge = one(".today-badge", row);
        if (previousBadge) previousBadge.remove();
        if (current) {
          const badge = document.createElement("span");
          badge.className = "today-badge";
          badge.textContent = "heute";
          one("dt", row).append(badge);
        }
      });
      one("#sun-window").textContent = timeLabel(sun.sunrise) + " – " + timeLabel(sun.sunset) + " Uhr";
      one("#studio-window").textContent = timeLabel(today.start) + " – " + timeLabel(today.end) + " Uhr";
      positionBar(one("#sun-bar"), sun.sunrise, sun.sunset);
      positionBar(one("#studio-bar"), today.start, today.end);
      one("#daylight").hidden = false;
      const extra = today.end - sun.sunset;
      if (extra > 15) {
        const duration = [Math.floor(extra / 60) ? Math.floor(extra / 60) + " Std." : "", extra % 60 ? (extra % 60) + " Min." : ""].filter(Boolean).join(" ");
        one("#hours-title").innerHTML = "Bei uns geht die Sonne <em>später unter.</em>";
        one("#hours-story").textContent = "Heute ist in Germersheim um " + timeLabel(sun.sunset) + " Uhr Sonnenuntergang. Das Studio bleibt bis " + timeLabel(today.end) + " Uhr geöffnet – " + duration + " länger.";
      } else {
        one("#hours-title").innerHTML = "Sonne, wenn es <em>dir passt.</em>";
        one("#hours-story").textContent = "Heute sind wir von " + timeLabel(today.start) + " bis " + timeLabel(today.end) + " Uhr für dich da.";
      }
    }
    const open = local.minutes >= today.start && local.minutes < today.end;
    const beforeOpening = local.minutes < today.start;
    const next = beforeOpening ? "heute um " + timeLabel(today.start) : "morgen um " + timeLabel(tomorrow.start);
    one(".opening-dot").classList.toggle("is-open", open);
    one("#opening-status").textContent = open ? "Jetzt geöffnet, bis " + timeLabel(today.end) + " Uhr" : "Öffnet " + next + " Uhr";
    one("#closing-note").textContent = open ? "Komm gerne vorbei. Heute sind wir bis " + timeLabel(today.end) + " Uhr im Studio." : "Wir öffnen " + next + " Uhr. Bis bald in der Marktstraße!";
    const marker = one(".now-marker");
    marker.hidden = local.minutes < 300;
    const at = chartPercent(local.minutes);
    marker.style.left = at + "%";
    marker.style.setProperty("--tag-shift", at > 91 ? "-100%" : at < 9 ? "0%" : "-50%");
    one("b", marker).textContent = "jetzt " + timeLabel(local.minutes);

    let solarText = "Sonnenuntergang um " + timeLabel(sun.sunset) + " Uhr";
    if (local.minutes < sun.sunrise) solarText = "Sonnenaufgang um " + timeLabel(sun.sunrise) + " Uhr";
    if (local.minutes >= sun.sunset) solarText = "Sonnenuntergang war um " + timeLabel(sun.sunset) + " Uhr";
    const weatherIsFresh = weather && Math.abs(now.getTime() - weather.time) < 3 * 3600000;
    one("#weather-line").textContent = weatherIsFresh ? "Germersheim · " + weather.label + " · " + solarText : "Germersheim · " + solarText;
  }

  async function refreshWeather() {
    if (document.hidden || Date.now() < nextWeatherFetch) return;
    nextWeatherFetch = Date.now() + 30 * 60000;
    const abort = new AbortController();
    const timeout = window.setTimeout(() => abort.abort(), 7000);
    const labels = {
      "clear-day": "klar", "clear-night": "klar", "partly-cloudy-day": "leicht bewölkt",
      "partly-cloudy-night": "leicht bewölkt", cloudy: "bewölkt", rain: "Regen",
      snow: "Schnee", sleet: "Schneeregen", fog: "Nebel", wind: "windig",
      hail: "Hagel", thunderstorm: "Gewitter"
    };
    try {
      const endpoint = new URL("https://api.brightsky.dev/current_weather");
      endpoint.search = new URLSearchParams({ lat: coordinates.latitude, lon: coordinates.longitude, tz: zone });
      const response = await fetch(endpoint, { signal: abort.signal, credentials: "omit", referrerPolicy: "no-referrer" });
      if (!response.ok) throw new Error("Wetterdienst nicht erreichbar");
      const reading = (await response.json()).weather;
      if (reading && Number.isFinite(reading.temperature)) {
        const condition = Object.hasOwn(labels, reading.icon) ? ", " + labels[reading.icon] : "";
        weather = { time: Date.parse(reading.timestamp), label: Math.round(reading.temperature).toLocaleString("de-DE") + " °C" + condition };
      }
    } catch {
      // The local astronomical calculation is also available offline.
      nextWeatherFetch = Date.now() + 5 * 60000;
    } finally {
      clearTimeout(timeout);
      updateLocalInfo();
    }
  }

  function setupChapters() {
    const hero = one(".hero");
    const video = one("#hero-film");
    const portrait = window.matchMedia("(orientation: portrait)");
    const films = video.canPlayType('video/mp4; codecs="avc1.640028"')
      ? { wide: video.dataset.wide, portrait: video.dataset.portrait }
      : { wide: video.dataset.wideWebm, portrait: video.dataset.portraitWebm };
    const chapters = all(".chapter");
    const tabs = all(".chapter-tab");
    const controls = one(".chapter-controls");
    const toggle = one(".play-toggle");
    let current = 0;
    const saveData = navigator.connection?.saveData === true;
    let enabled = !motion.matches && !saveData;
    const initialBounds = hero.getBoundingClientRect();
    let inView = initialBounds.bottom > 0 && initialBounds.top < window.innerHeight;
    let timer = null;
    let deadline = 0;
    let remaining = 6500;
    let resumeAt = 0;

    video.muted = true;
    video.addEventListener("loadedmetadata", () => {
      if (resumeAt > 0 && Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = resumeAt % video.duration;
      }
      resumeAt = 0;
    });
    video.addEventListener("playing", () => video.classList.add("has-frame"));
    video.addEventListener("error", () => {
      video.classList.remove("has-frame");
      enabled = false;
      syncPlayback();
    });

    function stopTimer() {
      if (timer === null) return;
      remaining = Math.max(0, deadline - performance.now());
      clearTimeout(timer);
      timer = null;
    }

    function syncPlayback() {
      stopTimer();
      const running = enabled && inView && !document.hidden;
      controls.classList.toggle("stopped", !enabled);
      controls.style.setProperty("--play-state", running ? "running" : "paused");
      const label = enabled ? "Film und Kapitel pausieren" : "Film und Kapitel abspielen";
      toggle.setAttribute("aria-label", label);
      toggle.title = label;
      one("use", toggle).setAttribute("href", enabled ? "#pause" : "#play");
      if (!running) {
        video.pause();
        return;
      }
      const source = portrait.matches ? films.portrait : films.wide;
      if (video.getAttribute("src") !== source || video.error) {
        if (video.readyState >= 1) resumeAt = video.currentTime;
        video.classList.remove("has-frame");
        video.src = source;
      }
      if (video.paused) {
        void video.play().catch(error => {
          if (error.name !== "NotAllowedError" || !video.paused) return;
          enabled = false;
          syncPlayback();
        });
      }
      deadline = performance.now() + remaining;
      timer = window.setTimeout(() => selectChapter((current + 1) % tabs.length), remaining);
    }

    function selectChapter(index, manual = false) {
      stopTimer();
      current = index;
      remaining = manual ? 10400 : 6500;
      controls.style.setProperty("--duration", remaining + "ms");
      chapters.forEach((chapter, i) => {
        chapter.classList.toggle("active", i === current);
        chapter.setAttribute("aria-hidden", String(i !== current));
      });
      tabs.forEach((tab, i) => {
        tab.classList.remove("active");
        tab.classList.toggle("complete", i < current);
        tab.setAttribute("aria-pressed", String(i === current));
      });
      void tabs[current].offsetWidth;
      tabs[current].classList.add("active");
      syncPlayback();
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => selectChapter(index, true));
      tab.addEventListener("keydown", event => {
        let next = index;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        else return;
        event.preventDefault();
        tabs[next].focus();
        selectChapter(next, true);
      });
    });
    toggle.addEventListener("click", () => {
      enabled = !enabled;
      syncPlayback();
    });
    motion.addEventListener("change", () => {
      enabled = !motion.matches && !saveData;
      syncPlayback();
    });
    portrait.addEventListener("change", () => {
      video.classList.remove("has-frame");
      syncPlayback();
    });
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(([entry]) => {
        inView = entry.isIntersecting;
        syncPlayback();
      }, { threshold: 0.03 });
      observer.observe(hero);
    }
    document.addEventListener("visibilitychange", syncPlayback);
    selectChapter(0);
  }

  function setupMenu() {
    const nav = one(".site-nav");
    const button = one(".menu-button");
    const links = one(".nav-links");
    function setOpen(open, returnFocus = false) {
      nav.classList.toggle("menu-open", open);
      button.setAttribute("aria-expanded", String(open));
      button.setAttribute("aria-label", open ? "Menü schließen" : "Menü öffnen");
      one("use", button).setAttribute("href", open ? "#close" : "#menu");
      if (returnFocus) button.focus();
    }
    button.addEventListener("click", () => {
      const open = button.getAttribute("aria-expanded") !== "true";
      setOpen(open);
      if (open) one("a", links).focus({ preventScroll: true });
    });
    links.addEventListener("click", event => {
      const link = event.target.closest("a");
      if (!link || !nav.classList.contains("menu-open")) return;
      setOpen(false);
      const target = document.querySelector(link.hash);
      if (target) {
        target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      }
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && nav.classList.contains("menu-open")) setOpen(false, true);
    });
    document.addEventListener("pointerdown", event => {
      if (!nav.contains(event.target)) setOpen(false);
    });
    document.addEventListener("focusin", event => {
      if (!nav.contains(event.target) && nav.classList.contains("menu-open")) setOpen(false);
    });
    window.matchMedia("(max-width: 940px)").addEventListener("change", () => setOpen(false));
  }

  function setupMap() {
    const panel = one("#map-panel");
    const prompt = one(".map-prompt", panel);
    const load = one("#load-map");
    load.addEventListener("click", () => {
      if (one("iframe", panel)) return;
      const frame = document.createElement("iframe");
      frame.title = "Google Maps – Werner’s Happy Sun, Marktstraße 2 in Germersheim";
      frame.referrerPolicy = "no-referrer";
      const url = new URL("https://www.google.com/maps");
      url.search = new URLSearchParams({ q: "Werner's Happy Sun, Marktstraße 2, 76726 Germersheim", z: 17, output: "embed" });
      frame.src = url.href;
      const tools = document.createElement("div");
      tools.className = "map-tools";
      const external = document.createElement("a");
      external.textContent = "In Google Maps öffnen";
      external.href = one(".contact-links a[href*='/maps/dir/']").href;
      external.target = "_blank";
      external.rel = "noopener noreferrer";
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "Karte schließen";
      close.addEventListener("click", () => {
        frame.remove();
        tools.remove();
        prompt.hidden = false;
        load.focus({ preventScroll: true });
      });
      tools.append(close, external);
      prompt.hidden = true;
      panel.append(frame, tools);
      close.focus({ preventScroll: true });
    });
  }

  function setupStudioGallery() {
    const thumbnails = all(".studio-photos a");
    const dialog = one("#studio-lightbox");
    if (!dialog || !thumbnails.length || typeof dialog.showModal !== "function") return;
    const image = one("#lightbox-image", dialog);
    const caption = one("#lightbox-caption", dialog);
    const count = one("#lightbox-count", dialog);
    const close = one(".lightbox-close", dialog);
    let current = 0;
    let opener = null;
    let touchStartX = null;

    function show(index) {
      current = (index + thumbnails.length) % thumbnails.length;
      const link = thumbnails[current];
      const thumbnailImage = one("img", link);
      image.src = link.href;
      image.alt = thumbnailImage.alt;
      caption.textContent = thumbnailImage.alt;
      count.textContent = `${current + 1} / ${thumbnails.length}`;
    }

    thumbnails.forEach((link, index) => {
      link.setAttribute("aria-label", `Bild ansehen: ${one("img", link).alt}`);
      link.addEventListener("click", event => {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        opener = link;
        show(index);
        dialog.showModal();
        document.body.classList.add("gallery-open");
        close.focus();
      });
    });

    close.addEventListener("click", () => dialog.close());
    one(".lightbox-prev", dialog).addEventListener("click", () => show(current - 1));
    one(".lightbox-next", dialog).addEventListener("click", () => show(current + 1));
    dialog.addEventListener("click", event => {
      if (event.target === dialog || event.target.classList.contains("lightbox-shell")) dialog.close();
    });
    dialog.addEventListener("keydown", event => {
      if (event.key === "ArrowLeft") { event.preventDefault(); show(current - 1); }
      if (event.key === "ArrowRight") { event.preventDefault(); show(current + 1); }
    });
    dialog.addEventListener("touchstart", event => {
      touchStartX = event.touches.length === 1 ? event.touches[0].clientX : null;
    }, { passive: true });
    dialog.addEventListener("touchend", event => {
      if (touchStartX === null || !event.changedTouches.length) return;
      const distance = event.changedTouches[0].clientX - touchStartX;
      if (Math.abs(distance) > 55) show(current + (distance < 0 ? 1 : -1));
      touchStartX = null;
    }, { passive: true });
    dialog.addEventListener("close", () => {
      document.body.classList.remove("gallery-open");
      image.removeAttribute("src");
      if (opener) opener.focus({ preventScroll: true });
    });
  }

  function setupScroll() {
    const photos = all(".photo-window");
    let pending = false;
    function paint() {
      pending = false;
      if (motion.matches) return;
      for (const photo of photos) {
        const bounds = photo.getBoundingClientRect();
        if (bounds.bottom < 0 || bounds.top > window.innerHeight) continue;
        const position = (window.innerHeight - bounds.top) / (window.innerHeight + bounds.height);
        photo.style.setProperty("--photo-y", (-10 + 10 * position).toFixed(2) + "%");
      }
    }
    function requestPaint() {
      if (!pending) window.requestAnimationFrame(paint);
      pending = true;
    }
    window.addEventListener("scroll", requestPaint, { passive: true });
    window.addEventListener("resize", requestPaint, { passive: true });
    paint();
    if (!("IntersectionObserver" in window) || motion.matches) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("seen");
          observer.unobserve(entry.target);
        }
      }
    }, { threshold: .12 });
    all(".reveal").forEach(element => observer.observe(element));
  }

  function setupSunPointer() {
    const root = document.documentElement;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const cursor = one(".sun-cursor");
    const light = one(".cursor-light");
    function clear() {
      root.classList.remove("sun-pointer");
      cursor.classList.remove("pressed", "over-link");
    }
    function position(event) {
      if (motion.matches || !event.isPrimary || event.pointerType === "touch" || !fine.matches) return;
      const target = event.target;
      if (!(target instanceof Element) || target.closest(".studio-lightbox, .map-tools, .map-panel iframe")) {
        clear();
        return;
      }
      const xy = "translate3d(" + event.clientX + "px," + event.clientY + "px,0)";
      cursor.style.transform = xy;
      root.classList.add("sun-pointer");
      cursor.classList.toggle("over-link", Boolean(target.closest("a,button,.ticket")));
      light.style.transform = xy;
    }
    document.addEventListener("pointermove", position, { passive: true });
    document.addEventListener("pointerdown", event => { if (event.pointerType !== "touch") { position(event); cursor.classList.add("pressed"); } }, { passive: true });
    document.addEventListener("pointerup", () => cursor.classList.remove("pressed"), { passive: true });
    document.addEventListener("pointerout", event => { if (event.relatedTarget === null) clear(); }, { passive: true });
    window.addEventListener("blur", clear);
    motion.addEventListener("change", clear);
  }

  document.documentElement.classList.add("enhanced");
  setupMenu();
  setupMap();
  setupStudioGallery();
  updateLocalInfo();
  setupChapters();
  setupScroll();
  setupSunPointer();
  refreshWeather();
  window.setInterval(() => {
    if (!document.hidden) {
      updateLocalInfo();
      refreshWeather();
    }
  }, 30000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      updateLocalInfo();
      refreshWeather();
    }
  });
})();
