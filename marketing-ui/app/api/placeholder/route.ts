import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Placeholder: Just log the data
    console.log('Waitlist submission:', body);
    
    // In production, you would save this to a database
    // For now, just return success
    return NextResponse.json(
      { success: true, message: 'Thank you for joining the waitlist!' },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, message: 'Something went wrong' },
      { status: 500 }
    );
  }
}

