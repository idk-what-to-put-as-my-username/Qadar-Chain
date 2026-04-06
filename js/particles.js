tsParticles.load("particles", {
  background: {
    color: "transparent",
  },
  particles: {
    number: {
      value: 40,
    },
    color: { value: "#ffffff" },
    shape: { type: "polygon", polygon: { sides: 4 } }, // square sparks
    opacity: {
      value: { min: 0.7, max: 0.8 },
      animation: {
        enable: true,
        speed: 0.5,
        minimumValue: 0, // fade out
        sync: false,
      },
    },
    size: {
      value: { min: 1, max: 1.2 },
    },
    move: {
      enable: true,
      speed: { min: 0.5, max: 1.2 },
      direction: "top",
      random: true,
      straight: false,
      outModes: { default: "out" },
    },
  },

});

