import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { setDbUserContext } from "../lib/audit.js";

const JWT_SECRET = process.env.JWT_SECRET || "dormi-secret-key-2026-change-me";

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing or invalid authorization header. Please login again."
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    (req as any).user = decoded;

    // Stamp the DB session with the acting user so audit triggers on the
    // money-event source tables can attribute changes accurately. This is
    // best-effort — failures don't block the request (triggers fall back
    // to 'system' attribution).
    setDbUserContext({
      id: decoded?.id,
      role: decoded?.role,
      name: decoded?.name,
      phone: decoded?.phone,
    }).catch(() => { /* swallowed in setDbUserContext */ });

    next();
  } catch (err) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Your session has expired. Please login again."
    });
  }
}

export function authorize(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({
        error: "forbidden",
        message: "You do not have permission to perform this action."
      });
    }

    next();
  };
}
