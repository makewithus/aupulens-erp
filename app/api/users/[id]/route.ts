import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import User from '@/models/auth/User';
import Employee from '@/models/hr/Employee';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const tenantId = (session.user as any).tenantId || 'default-tenant';
    const updateData = await req.json();

    await connectDB();

    // Don't allow updating certain fields
    delete updateData.password;
    delete updateData.createdBy;
    delete updateData.createdAt;
    delete updateData.tenantId;
    delete updateData._id;

    const validRoles = [
      'admin',
      'finance',
      'hr',
      'sales',
      'inventory',
      'project',
      'manufacturing',
    ];

    if (updateData.role && !validRoles.includes(updateData.role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    if (updateData.email) {
      updateData.email = String(updateData.email).trim().toLowerCase();
      const emailOwner = await User.findOne({
        _id: { $ne: id },
        tenantId,
        email: updateData.email,
      });
      if (emailOwner) {
        return NextResponse.json(
          { error: 'User with this email already exists in your organization' },
          { status: 409 },
        );
      }
    }

    if (typeof updateData.employeeId === 'string') {
      updateData.employeeId = updateData.employeeId.trim();
      if (!updateData.employeeId) {
        delete updateData.employeeId;
      }
    }

    if (updateData.employeeId) {
      const employeeIdOwner = await User.findOne({
        _id: { $ne: id },
        tenantId,
        employeeId: updateData.employeeId,
      });
      if (employeeIdOwner) {
        return NextResponse.json(
          { error: 'Employee ID already exists in your organization' },
          { status: 409 },
        );
      }
    }

    const user = await User.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // ── Sync changes to linked Employee ──
    const linkedEmployee = await Employee.findOne({ userId: id, tenantId });
    if (linkedEmployee) {
      const empUpdate: any = {};
      if (updateData.name) {
        const parts = updateData.name.trim().split(/\s+/);
        empUpdate.firstName = parts[0] || linkedEmployee.firstName;
        empUpdate.lastName = parts.slice(1).join(' ') || linkedEmployee.lastName;
      }
      if (updateData.email) empUpdate.email = updateData.email;
      if (updateData.phone) empUpdate.phone = updateData.phone;
      if (updateData.designation) empUpdate.designation = updateData.designation;
      if (updateData.employeeId) empUpdate.employeeCode = updateData.employeeId;

      if (Object.keys(empUpdate).length > 0) {
        await Employee.findOneAndUpdate(
          { _id: linkedEmployee._id, tenantId },
          { $set: empUpdate },
        );
      }
    }

    return NextResponse.json(
      {
        message: 'User updated successfully',
        user,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('Update user error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Something went wrong' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const tenantId = (session.user as any).tenantId || 'default-tenant';

    await connectDB();

    const user = await User.findOneAndDelete({ _id: id, tenantId });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(
      { message: 'User deleted successfully' },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('Delete user error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Something went wrong' },
      { status: 500 }
    );
  }
}
