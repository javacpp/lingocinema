import { TTSProvider } from './interface.js';
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

export class PiperTTSProvider implements TTSProvider {
  readonly name = "piper";
  private binaryPath: string;
  private modelPath: string;

  constructor(binaryPath: string = "piper", modelPath: string = "") {
    this.binaryPath = binaryPath;
    this.modelPath = modelPath;
  }

  async synthesize(text: string): Promise<Buffer> {
    if (!this.modelPath) throw new Error("PIPER_MODEL_PATH is required");
    const tmpFile = path.join(os.tmpdir(), `piper_${Date.now()}.wav`);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(this.binaryPath, ["--model", this.modelPath, "--output_file", tmpFile], { stdio: ["pipe", "pipe", "pipe"] });
      let stderr = "";
      proc.stderr.on("data", (d) => stderr += d.toString());
      proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr)));
      proc.stdin.write(text);
      proc.stdin.end();
    });

    const wavBuffer = fs.readFileSync(tmpFile);
    fs.unlinkSync(tmpFile);
    return wavBuffer;
  }
}
