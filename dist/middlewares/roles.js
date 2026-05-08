export function onlyRole(...roles) {
    return (req, res, next) => {
        const userRole = req.user?.rol;
        if (!userRole || !roles.includes(userRole)) {
            res.status(403).json({
                ok: false,
                message: "No tienes permisos",
            });
            return;
        }
        next();
    };
}
//# sourceMappingURL=roles.js.map