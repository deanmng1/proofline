import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { MailList } from "@/components/mail/mail-list";
import { MailReader } from "@/components/mail/mail-reader";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { ListSkeleton } from "@/components/shared/skeletons";
import { StatePanel } from "@/components/shared/state-panel";
import { getMailRequest, setMailReadRequest } from "@/features/mail/mail-api";
import type { MailFolder, MailMessage } from "@/types";

export const MailPage = () => {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const folder: MailFolder = pathname.endsWith("/sent") ? "sent" : "inbox";
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const mailQuery = useQuery<MailMessage[]>({
    queryKey: ["mail", folder],
    queryFn: () => getMailRequest(folder),
  });

  const setRead = useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) => setMailReadRequest(id, read),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mail"] }),
  });

  const messages = mailQuery.data ?? [];
  const selected = messages.find((message) => message.id === selectedId) ?? null;

  const handleSelect = (message: MailMessage) => {
    setSelectedId(message.id);
    if (!message.read) {
      setRead.mutate({ id: message.id, read: true });
    }
  };

  const title = folder === "sent" ? "Sent" : "Inbox";
  const unreadCount = messages.filter((message) => !message.read).length;

  const reader = selected ? (
    <div className="-m-6 border-t border-[var(--border)]">
      <MailReader
        message={selected}
        onBack={() => setSelectedId(null)}
        onMarkUnread={(message) => {
          setRead.mutate({ id: message.id, read: false });
          setSelectedId(null);
        }}
      />
    </div>
  ) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mail"
        title={title}
        description="Mock mailbox demonstrating a two-pane app surface inside the admin shell."
      />

      {mailQuery.isLoading ? (
        <ListSkeleton count={6} />
      ) : mailQuery.isError ? (
        <StatePanel
          kind="error"
          title="Could not load messages"
          description="The mock mail endpoint failed."
          onRetry={() => void mailQuery.refetch()}
        />
      ) : messages.length === 0 ? (
        <EmptyState
          title={`Nothing in ${title.toLowerCase()}`}
          description="Messages you receive or send will show up here."
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.4fr]">
          <div className={selected ? "hidden xl:block" : ""}>
            <SectionCard
              title={title}
              description={`${messages.length} messages · ${unreadCount} unread`}
              className="overflow-hidden"
            >
              <div className="-m-6 border-t border-[var(--border)]">
                <MailList messages={messages} selectedId={selectedId} onSelect={handleSelect} />
              </div>
            </SectionCard>
          </div>

          <div className={selected ? "" : "hidden xl:block"}>
            <SectionCard
              title="Reader"
              description={selected ? "Message details" : "Select a message to read it here."}
              className="overflow-hidden"
            >
              {reader}
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  );
};
