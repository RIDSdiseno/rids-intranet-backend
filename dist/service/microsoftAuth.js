import jwt from "jsonwebtoken";
export const verifyMicrosoftToken = async (idToken) => {
    const decoded = jwt.decode(idToken);
    if (!decoded) {
        throw new Error("Token inválido");
    }
    return {
        email: decoded.preferred_username,
        name: decoded.name,
        oid: decoded.oid
    };
};
//# sourceMappingURL=microsoftAuth.js.map