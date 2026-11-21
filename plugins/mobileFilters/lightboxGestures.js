(function () {
  "use strict";

  const touchScreen = window.matchMedia("(pointer: coarse) and (hover: none)");
  let image;
  let gesture;
  let lastTap;

  function reset() {
    if (image) {
      image.wrapper.classList.remove("smf-gesture-zoom");
      image.wrapper.style.removeProperty("--smf-gesture-transform");
      image.observer.disconnect();
    }
    image = undefined;
    gesture = undefined;
    lastTap = undefined;
  }

  function stageImage(target) {
    if (!touchScreen.matches || target.closest?.("button, a")) return;
    const display = target.closest?.(".Lightbox .Lightbox-display");
    const carousel = display?.querySelector(".Lightbox-carousel");
    if (!carousel) return;
    const offset = carousel.style.left;
    const index = Math.round(-Number.parseFloat(offset) / 100);
    const wrapper = carousel.children[index]?.querySelector(".Lightbox-carousel-image-wrapper");
    const photo = wrapper?.querySelector("img");
    if (!photo) return;
    return { display, carousel, offset, wrapper, photo };
  }

  function touchCenter(touches) {
    const first = touches[0];
    const second = touches[1] ?? first;
    return {
      x: (first.clientX + second.clientX) / 2,
      y: (first.clientY + second.clientY) / 2,
      distance: Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY),
    };
  }

  function zoomAt(scale, from, to, previous) {
    const ratio = scale / previous.scale;
    const centerX = image.base.left + image.base.width / 2;
    const centerY = image.base.top + image.base.height / 2;
    const viewportX = image.viewport.left + image.viewport.width / 2 - centerX;
    const viewportY = image.viewport.top + image.viewport.height / 2 - centerY;
    const maxX = Math.max(0, (image.base.width * scale - image.viewport.width) / 2);
    const maxY = Math.max(0, (image.base.height * scale - image.viewport.height) / 2);
    const x = to.x - centerX - (from.x - centerX - previous.x) * ratio;
    const y = to.y - centerY - (from.y - centerY - previous.y) * ratio;
    image.scale = scale;
    image.x = Math.min(viewportX + maxX, Math.max(viewportX - maxX, x));
    image.y = Math.min(viewportY + maxY, Math.max(viewportY - maxY, y));
    if (scale === 1) {
      image.x = 0;
      image.y = 0;
      image.wrapper.classList.remove("smf-gesture-zoom");
      image.wrapper.style.removeProperty("--smf-gesture-transform");
      return;
    }
    // Transform the native wrapper so Safari does not distort large images.
    const baseTransform = image.wrapper.style.transform;
    image.wrapper.style.setProperty("--smf-gesture-transform",
      `translate(${image.x}px, ${image.y}px) ${baseTransform} scale(${scale})`);
    image.wrapper.classList.add("smf-gesture-zoom");
  }

  function preventNative(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function start(event) {
    const stage = stageImage(event.target);
    if (!stage) return;
    preventNative(event);
    if (stage.wrapper !== image?.wrapper) {
      reset();
      const base = stage.photo.getBoundingClientRect();
      const viewport = stage.display.getBoundingClientRect();
      if (!base.width || !base.height) return;
      const observer = new MutationObserver(() => {
        if (stage.carousel.style.left !== stage.offset) reset();
      });
      observer.observe(stage.carousel, { attributes: true, attributeFilter: ["style"] });
      image = { ...stage, base, viewport, observer, scale: 1, x: 0, y: 0 };
    }
    const point = touchCenter(event.touches);
    const pinch = event.touches.length > 1;
    if (pinch) lastTap = undefined;
    gesture = { start: point, scale: image.scale, x: image.x, y: image.y, pinch, moved: false };
  }

  function move(event) {
    if (!gesture || !image) return;
    preventNative(event);
    const point = touchCenter(event.touches);
    const { start, scale, pinch } = gesture;
    if (Math.hypot(point.x - start.x, point.y - start.y) > 12) gesture.moved = true;
    if (pinch && point.distance && start.distance) {
      const nextScale = Math.min(5, Math.max(1, scale * point.distance / start.distance));
      zoomAt(nextScale, start, point, gesture);
    } else if (!pinch && scale > 1) {
      zoomAt(scale, start, point, gesture);
    }
  }

  function end(event) {
    if (!gesture || !image) return;
    preventNative(event);
    if (event.touches.length) {
      if (event.touches.length === 1) {
        const point = touchCenter(event.touches);
        gesture = { start: point, scale: image.scale, x: image.x, y: image.y, pinch: false, moved: true, afterPinch: true };
      }
      return;
    }
    const { start, scale, pinch, moved, afterPinch } = gesture;
    gesture = undefined;
    if (pinch) return;

    const point = touchCenter(event.changedTouches);
    const dx = point.x - start.x;
    const dy = point.y - start.y;
    if (moved || Math.hypot(dx, dy) > 12) {
      lastTap = undefined;
      if (!afterPinch && scale === 1 && Math.abs(dx) >= 52 && Math.abs(dx) > Math.abs(dy) * 1.35) {
        const key = dx < 0 ? "ArrowRight" : "ArrowLeft";
        reset();
        document.dispatchEvent(new KeyboardEvent("keydown", { key }));
      }
      return;
    }
    if (lastTap && event.timeStamp - lastTap.time < 320 && Math.hypot(point.x - lastTap.x, point.y - lastTap.y) < 28) {
      zoomAt(scale > 1 ? 1 : 2.5, point, point, image);
      lastTap = undefined;
      return;
    }
    lastTap = { ...point, time: event.timeStamp };
  }

  const capture = { capture: true, passive: false };
  document.addEventListener("touchstart", start, capture);
  document.addEventListener("touchmove", move, capture);
  document.addEventListener("touchend", end, capture);
  document.addEventListener("touchcancel", reset, capture);
  for (const name of ["mousedown", "mouseup", "click", "dblclick", "pointerdown", "pointermove", "pointerup"]) {
    document.addEventListener(name, (event) => {
      if (stageImage(event.target)) preventNative(event);
    }, capture);
  }
  window.addEventListener("resize", reset);
  touchScreen.addEventListener("change", reset);
})();
