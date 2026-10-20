const THEME_STORAGE_KEY = 'rrd-analyzer.theme';
const CHOSEN_THEMES = ['light', 'dark'];

const wearChosenTheme = () => {
  try {
    const chosen = localStorage.getItem(THEME_STORAGE_KEY);

    if (CHOSEN_THEMES.includes(chosen)) {
      document.documentElement.classList.add(chosen);
    }
  } catch {
    return;
  }
};

wearChosenTheme();
