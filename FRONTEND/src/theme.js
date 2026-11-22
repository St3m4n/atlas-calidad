import { createTheme } from "@mui/material";

const theme = createTheme({
  palette: {
    primary: { main: "#1B7576" }, // Verde azulado
    secondary: { main: "#4BBC7F" }, // Verde claro
    background: { default:"#fffff", paper: "#ffffff" }, // slate-50
  },
  typography: {
    fontFamily: "Poppins, system-ui, Avenir, Helvetica, Arial, sans-serif",
    fontSize: 14, // valor por defecto de MUI: con la raíz en 16 px el texto normal mide 16 px (DEF-011)
    h5: { fontWeight: 700 },
    h6: { fontWeight: 600 },
  },
  shape: { borderRadius: 4 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none", borderRadius: 4, boxShadow: "none" },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: { boxShadow: "none", borderBottom: "1px solid #e5e7eb" },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { borderRadius: 4, border: "1px solid #eef2f7" },
      },
    },
  },
});

export default theme;
