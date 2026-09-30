// Settings you can change without touching the rest of the app.
window.APP_CONFIG = {
  // From Supabase: Project Settings -> API. Leave blank to run in "this device only" mode.
  SUPABASE_URL: "https://rzrajaazogldpxcmvifn.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_kLEJ_YWGuNhUSZhgmoJfOQ_x7LzJ9Fy",

  // Daily protein goal in grams (the goal counts as met at the first number).
  PROTEIN_TARGET: 90,
  PROTEIN_TOP: 100,

  // One-tap protein buttons. Edit, add or remove freely.
  PROTEIN_PRESETS: [
    { g: 25, label: "Shake" },
    { g: 18, label: "Greek yogurt" },
    { g: 12, label: "2 eggs" },
    { g: 14, label: "Cottage cheese" },
    { g: 30, label: "Chicken" },
    { g: 25, label: "Fish" }
  ]
};
