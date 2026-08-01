import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { username, password } = (await req.json()) as {
      username?: string;
      password?: string;
    };

    if (!username?.trim() || !password || password.length < 6) {
      return NextResponse.json(
        { error: "用户名不能为空，密码至少 6 位" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { username: username.trim() },
    });
    if (existing) {
      return NextResponse.json({ error: "用户名已存在" }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username: username.trim(),
        password: hashed,
      },
    });

    return NextResponse.json({
      id: user.id,
      username: user.username,
      message: "注册成功，请登录",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[register] error:", message);
    return NextResponse.json({ error: "注册失败", detail: message }, { status: 500 });
  }
}
