import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

const CONFIG_PATH = path.resolve(process.cwd(), "../config/channels.json");

export async function GET() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return NextResponse.json({ channels: [], settings: {} });
    }
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return NextResponse.json(config);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(body, null, 2), "utf8");
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
