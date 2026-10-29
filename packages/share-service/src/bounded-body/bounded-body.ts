import { HTTP_HEADERS } from '../constants/http';

const UNDECLARED_LENGTH = '0';

export const boundedBodyOf = async (request: Request, maximumBytes: number): Promise<ArrayBuffer | null> => {
  if (Number(request.headers.get(HTTP_HEADERS.CONTENT_LENGTH) ?? UNDECLARED_LENGTH) > maximumBytes) {
    return null;
  }

  const content = await request.arrayBuffer();

  return content.byteLength > maximumBytes ? null : content;
};
