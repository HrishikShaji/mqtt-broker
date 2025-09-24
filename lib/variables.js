import dotenv from "dotenv"

dotenv.config()

export const DATABASE_URL = process.env.DATABASE_URL || ""
export const TYPE = process.env.TYPE || ""
export const PROJECT_ID = process.env.PROJECT_ID || ""
export const PRIVATE_KEY_ID = process.env.PRIVATE_KEY_ID || ""
export const PRIVATE_KEY = process.env.PRIVATE_KEY || ""
export const CLIENT_EMAIL = process.env.CLIENT_EMAIL || ""
export const CLIENT_ID = process.env.CLIENT_ID || ""
export const AUTH_URI = process.env.AUTH_URI || ""
export const TOKEN_URI = process.env.TOKEN_URI || ""
export const AUTH_PROVIDER_CERT_URL = process.env.AUTH_PROVIDER_CERT_URL || ""
export const CLIENT_CERT_URL = process.env.CLIENT_CERT_URL || ""
export const UNIVERSE_DOMAIN = process.env.UNIVERSE_DOMAIN || ""
