import { NextResponse } from 'next/server';
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import User from '@/models/auth/User';

const PUBLIC_PROFILE_PROJECTION = '-password -tempToken -tempTokenHash -tempTokenExpiry -passwordResetTokenHash -passwordResetTokenExpiry';

export async function GET() {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const userId = (session.user as any).id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await connectDB();

    const query = { _id: userId, tenantId };
    const user = await User.findOne(query)
      .select(PUBLIC_PROFILE_PROJECTION)
      .lean();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user }, { status: 200 });
  } catch (error: unknown) {
    console.error('Get profile error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch profile', code: 'PROFILE_FETCH_FAILED' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const userId = (session.user as any).id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();

    // AUP-001: Strict whitelist of profile-editable fields
    const ALLOWED_PROFILE_FIELDS = [
      "name",
      "phone",
      "profilePic",
      "preferences",
    ] as const;

    const updates: Record<string, any> = {};
    for (const field of ALLOWED_PROFILE_FIELDS) {
      if (field in body && body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (updates.preferences !== undefined) {
      const preferences = updates.preferences;
      if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) {
        return NextResponse.json({ error: "Preferences must be an object" }, { status: 400 });
      }
      updates.preferences = Object.fromEntries(["theme", "language", "timezone"]
        .filter(key => Object.hasOwn(preferences, key)).map(key => [key, preferences[key]]));
      if ((preferences.theme !== undefined && !["light", "dark", "system"].includes(preferences.theme)) ||
          ["language", "timezone"].some(key => preferences[key] !== undefined &&
            (typeof preferences[key] !== "string" || preferences[key].length > (key === "language" ? 35 : 100)))) {
        return NextResponse.json({ error: "Invalid profile preferences" }, { status: 400 });
      }
    }
    if (["name", "phone", "profilePic"].some(key => updates[key] !== undefined &&
        (typeof updates[key] !== "string" || updates[key].length > (key === "profilePic" ? 2048 : 200)))) {
      return NextResponse.json({ error: "Invalid profile fields" }, { status: 400 });
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No editable profile fields provided' },
        { status: 400 }
      );
    }

    await connectDB();

    const query = { _id: userId, tenantId };
    const updatedUser = await User.findOneAndUpdate(
      query,
      { $set: updates },
      { new: true, runValidators: true }
    ).select(PUBLIC_PROFILE_PROJECTION);

    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user: updatedUser }, { status: 200 });
  } catch (error: unknown) {
    console.error('Update profile error:', error);
    return NextResponse.json(
      { error: 'Failed to update profile', code: 'PROFILE_UPDATE_FAILED' },
      { status: 500 }
    );
  }
}
