import { NextResponse } from 'next/server';
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import User from '@/models/User';

export async function GET() {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
await connectDB();

    const user = await User.findOne({ email: session.user.email })
      .select('-password')
      .lean();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user }, { status: 200 });
  } catch (error: unknown) {
    console.error('Get profile error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Something went wrong' },
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

    const updates = await req.json();
    
    // Remove fields that shouldn't be updated via this endpoint
    delete updates.email;
    delete updates.role;
    delete updates.password;
    delete updates._id;
    delete updates.createdAt;
    delete updates.updatedAt;

    await connectDB();

    const updatedUser = await User.findOneAndUpdate(
      { email: session.user.email },
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user: updatedUser }, { status: 200 });
  } catch (error: unknown) {
    console.error('Update profile error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Something went wrong' },
      { status: 500 }
    );
  }
}
