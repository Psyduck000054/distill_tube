let allSystemTags = window.APP_DATA.tags || [];
let tagState = {
  mode: "edit",
  dbId: null,
  tags: [],
};

const PAIRS = [
  { name: "Red", base: "#FFB3BA", highlight: "#FF073A" },
  { name: "Orange", base: "#FFDFBA", highlight: "#FF5F1F" },
  { name: "Yellow", base: "#FFF9B1", highlight: "#FFF01F" },
  { name: "Green", base: "#BAFFC9", highlight: "#39FF14" },
  { name: "Cyan", base: "#67E8F9", highlight: "#00FFFF" },
  { name: "Blue", base: "#C2D4FF", highlight: "#1F51FF" },
  { name: "Violet", base: "#D8B4FE", highlight: "#BC13FE" },
  { name: "Pink", base: "#FFC0CB", highlight: "#FF00FF" },
];

const TagManager = {
  colors: JSON.parse(localStorage.getItem("distill_tag_colors") || "{}"),

  saveColors: function () {
    localStorage.setItem("distill_tag_colors", JSON.stringify(this.colors));
    this.applyColors();
  },

  getRandomPair: function () {
    return PAIRS[Math.floor(Math.random() * PAIRS.length)];
  },

  getColorPair: function (tag) {
    let data = this.colors[tag];

    if (!data || typeof data === "string") {
      const pair = this.getRandomPair();

      data = { base: pair.base, highlight: pair.highlight };
      this.colors[tag] = data;

      this.saveColors();
    }

    return data;
  },

  applyColors: function () {
    document.querySelectorAll("[data-tag]").forEach((el) => {
      const tag = el.getAttribute("data-tag");

      if (tag) {
        const pair = this.getColorPair(tag);
        el.style.setProperty("--tag-base", pair.base);
        el.style.setProperty("--tag-highlight", pair.highlight);
      }
    });
  },
};
