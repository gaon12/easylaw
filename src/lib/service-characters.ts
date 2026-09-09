const serviceCharacters = {
  male: {
    id: "guide-male-001",
    src: "/media/characters/guide-male-001-640.webp",
    width: 358,
    height: 696,
    thumbhash: "4QeGAwA1lpCMyWf2hH1/5wR8eIeEWXc=",
  },
  female: {
    id: "guide-female-001",
    src: "/media/characters/guide-female-001-640.webp",
    width: 350,
    height: 696,
    thumbhash: "6eeFAwI2aGBcxmiYdI9Z+Ap0iHd1aWc=",
  },
  errorMale: {
    id: "guide-male-error-001",
    src: "/media/characters/guide-male-error-001-640.webp",
    width: 480,
    height: 640,
    thumbhash: "tecFBQDPoqJZmXe4hWl5hwWVKIB4",
  },
  errorFemale: {
    id: "guide-female-error-001",
    src: "/media/characters/guide-female-error-001-640.webp",
    width: 480,
    height: 640,
    thumbhash: "t+cFDQLhj0LKmXjYWoiHqGl1b1n3",
  },
  pair: {
    id: "easylaw-guides-v1",
    src: "/media/characters/easylaw-guides-v1-1200.webp",
    width: 1066,
    height: 1013,
    thumbhash: null,
  },
} as const;

type ServiceCharacterKind = keyof typeof serviceCharacters;

export { serviceCharacters };
export type { ServiceCharacterKind };
