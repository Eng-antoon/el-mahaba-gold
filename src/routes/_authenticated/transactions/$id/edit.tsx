import { createFileRoute, Navigate, useParams } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/transactions/$id/edit")({
  component: EditTransactionRedirect,
});

function EditTransactionRedirect() {
  const { id } = useParams({ from: "/_authenticated/transactions/$id/edit" });
  return <Navigate to="/new" search={{ transaction: id }} replace />;
}
