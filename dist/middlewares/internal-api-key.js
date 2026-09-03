export const syncAccess = (req, res, next) => {
    const internalKey = req.header("x-internal-api-key");
    const expected = process.env
        .INTRANET_INTERNAL_API_KEY;
    /* =========================================
       BACKEND MÓVIL
    ========================================= */
    if (expected &&
        internalKey === expected) {
        next();
        return;
    }
    /* =========================================
       USUARIO INTRANET
    ========================================= */
    const user = req.user;
    if (user &&
        [
            "ADMIN",
            "ADMINISTRACION",
        ].includes(user.rol)) {
        next();
        return;
    }
    res.status(403).json({
        error: "No autorizado para sincronizar solicitantes",
    });
};
//# sourceMappingURL=internal-api-key.js.map