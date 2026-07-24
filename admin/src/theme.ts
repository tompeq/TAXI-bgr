import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#171717",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#f4c900",
      contrastText: "#171717",
    },
    success: { main: "#18794e" },
    error: { main: "#c9372c" },
    warning: { main: "#a15c00" },
    background: {
      default: "#f6f7f8",
      paper: "#ffffff",
    },
    text: {
      primary: "#171717",
      secondary: "#60646c",
    },
    divider: "#dfe1e4",
  },
  shape: {
    borderRadius: 6,
  },
  typography: {
    fontFamily: 'Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    h1: { fontSize: "1.75rem", fontWeight: 750, lineHeight: 1.2 },
    h2: { fontSize: "1.25rem", fontWeight: 700, lineHeight: 1.3 },
    h3: { fontSize: "1rem", fontWeight: 700, lineHeight: 1.35 },
    button: { textTransform: "none", fontWeight: 650 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { minHeight: 40 } },
    },
    MuiIconButton: {
      styleOverrides: { root: { borderRadius: 6 } },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
    },
    MuiTextField: {
      defaultProps: { size: "small" },
    },
  },
});
