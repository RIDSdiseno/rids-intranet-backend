import jwt from "jsonwebtoken";

export const verifyMicrosoftToken = async (idToken: string) => {

  const decoded: any = jwt.decode(idToken);

  if (!decoded) {
    throw new Error("Token inválido");
  }

  return {
    email: decoded.preferred_username,
    name: decoded.name,
    oid: decoded.oid
  };

};