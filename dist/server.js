import app from "./app.js"; // 👈 default import (sin llaves)
const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
    console.log(`🚀 API escuchando en http://localhost:${PORT}`);
});
//# sourceMappingURL=server.js.map