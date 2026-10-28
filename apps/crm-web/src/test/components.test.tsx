import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type Column, DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { StatePanel } from "@/components/shared/state-panel";

describe("shared components", () => {
  it("StatePanel renders loading and error variants", () => {
    const { rerender } = render(
      <StatePanel kind="loading" title="Loading" description="Please wait" />,
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    rerender(<StatePanel kind="error" title="Failed" description="Try again later" />);
    expect(screen.getByText(/failed/i)).toBeInTheDocument();
  });

  it("EmptyState renders title and description", () => {
    render(<EmptyState title="Nothing here" description="Add something to begin" />);
    expect(screen.getByText(/nothing here/i)).toBeInTheDocument();
    expect(screen.getByText(/add something to begin/i)).toBeInTheDocument();
  });

  it("DataTable renders headers and rows", () => {
    const columns: Column<{ id: string; name: string }>[] = [
      { key: "name", header: "Name", render: (row) => row.name },
    ];
    render(
      <DataTable
        columns={columns}
        rows={[{ id: "1", name: "Ada" }]}
        getRowKey={(row) => row.id}
        caption="People"
      />,
    );
    expect(screen.getByRole("columnheader", { name: /name/i })).toBeInTheDocument();
    expect(screen.getByText(/ada/i)).toBeInTheDocument();
  });
});
