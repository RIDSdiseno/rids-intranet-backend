import jwt from "jsonwebtoken";

const token = jwt.sign(
  { email: "soporte@rids.cl", rol: "ADMIN", empresaId: null },
  process.env.JWT_SECRET,
  { subject: "24", expiresIn: "2h", algorithm: "HS256" }
);
console.log(token);
