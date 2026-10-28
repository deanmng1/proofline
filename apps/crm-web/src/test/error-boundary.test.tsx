import { fireEvent, render, screen } from "@testing-library/react";
import { ErrorBoundary } from "@/app/error-boundary";

const Boom = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error("boom");
  }
  return <p>recovered content</p>;
};

describe("ErrorBoundary", () => {
  it("renders a fallback when a child throws", () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/boom/i)).toBeInTheDocument();
  });

  it("clears the error and recovers after Try again", () => {
    const { rerender } = render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(
      <ErrorBoundary>
        <Boom shouldThrow={false} />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/recovered content/i)).toBeInTheDocument();
  });

  it("supports a custom fallback", () => {
    render(
      <ErrorBoundary fallback={(error) => <p>custom: {error.message}</p>}>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/custom: boom/i)).toBeInTheDocument();
  });
});
