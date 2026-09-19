// A remote write can commit even if its response is lost. Only remove a cloud
// object when a revision conflict proves the record was not committed.
export function canDiscardEvidence(error) {
  return process.env.STORAGE_BACKEND!=='supabase' || (error?.name==='AppError' && error.status===409);
}
