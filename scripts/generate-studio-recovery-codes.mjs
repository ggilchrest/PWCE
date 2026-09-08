import { generateRecoveryCodes } from "../src/http/studio-auth.js";

const count = process.argv[2] === undefined ? 10 : Number(process.argv[2]);
const codes = generateRecoveryCodes(count);
console.log("PWCE Studio recovery codes — store these offline; each code works once:");
for (const code of codes) console.log(code);
