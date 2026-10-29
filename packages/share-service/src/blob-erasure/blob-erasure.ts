export const eraseBlobsUnder = async (bucket: R2Bucket, prefix: string, pageSize: number): Promise<void> => {
  const listing = await bucket.list({ prefix, limit: pageSize });
  const keys = listing.objects.map((object) => object.key);

  if (keys.length > 0) {
    await bucket.delete(keys);
  }

  if (listing.truncated) {
    await eraseBlobsUnder(bucket, prefix, pageSize);
  }
};
