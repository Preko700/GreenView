
import { NextResponse, type NextRequest } from 'next/server';
// No se importa getDb ni Device para esta versión de diagnóstico

export async function GET(
  request: NextRequest,
  { params }: { params: { deviceId: string } }
) {
  const deviceId = params.deviceId;
  const { searchParams } = new URL(request.url);
  const userIdParam = searchParams.get('userId');

  // Log #1: Inicio de la solicitud en la versión mínima
  console.log(`[MINIMAL API /devices/${deviceId}] GET request received. DeviceID: ${deviceId}, UserID Param: ${userIdParam}`);

  try {
    // Simula un pequeño trabajo asíncrono, pero muy corto.
    await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay

    // Log #2: Justo antes de enviar la respuesta
    console.log(`[MINIMAL API /devices/${deviceId}] Preparing to send dummy response.`);
    
    return NextResponse.json({ 
      message: `Minimal API reached for device ${deviceId}`, 
      requestedDeviceId: deviceId,
      requestedUserIdParam: userIdParam,
      timestamp: Date.now(),
      status: "dummy_success"
    }, { status: 200 });

  } catch (error: any) {
    // Log #3: En caso de un error inesperado dentro de este manejador mínimo
    console.error(`[MINIMAL API /devices/${deviceId}] UNEXPECTED ERROR IN MINIMAL HANDLER: ${error.message}`, error.stack);
    return NextResponse.json({ 
      message: 'Minimal API handler encountered an unexpected error.', 
      errorDetails: error.message 
    }, { status: 500 });
  }
}
