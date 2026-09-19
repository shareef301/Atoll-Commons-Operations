import { AppError } from '@/db/store';

// Enforce limits while streaming, including requests with no Content-Length.
export async function boundedRequest(request:Request, limit:number) {
  const announced=Number(request.headers.get('content-length') || 0);
  if (announced>limit) throw new AppError('This request is too large.',413);
  const reader=request.body?.getReader();
  if (!reader) return new Request(request.url,{method:request.method,headers:request.headers});
  const chunks:Uint8Array[]=[];let size=0;
  try {
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new AppError('This request is too large.',413)}chunks.push(value)}
  } finally {reader.releaseLock()}
  const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length}
  return new Request(request.url,{method:request.method,headers:request.headers,body});
}
export async function readCommand(request:Request) {
  try {return await (await boundedRequest(request,100000)).json()}
  catch(error){if(error instanceof AppError)throw error;throw new AppError('Enter a valid record.',400)}
}
