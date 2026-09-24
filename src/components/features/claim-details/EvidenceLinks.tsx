
import { Evidence } from "@/app/types/dispute";
import { ExternalLink, FileText, LinkIcon, ShieldAlert } from "lucide-react";
import { sanitizeText, safeUrl } from "@/lib/security/evidence-sanitizer";
import { SafeExternalLink } from "@/components/security/SafeExternalLink";

/**
 * V2-FE-075 — Evidence links are untrusted API content. Titles, descriptions
 * and URLs are sanitized; unsafe URLs fail closed to an accessible blocked
 * placeholder instead of an anchor.
 */
export const EvidenceLinks = ({ evidences }: { evidences: Evidence[] }) => {
  return (
    <div className="bg-[#13141b] border border-gray-800 rounded-xl p-6 mb-6">
      <div className="flex items-center space-x-2 text-white font-medium mb-4">
        <LinkIcon size={18} />
        <h2>Evidence Links</h2>
      </div>
      <div className="space-y-3">
        {evidences.map((evidence) => {
          const title = sanitizeText(evidence.title, 300);
          const description = sanitizeText(evidence.description, 600);
          const urlCheck = safeUrl(evidence.url);

          return (
            <div key={evidence.id} className="flex items-center justify-between p-4 rounded-lg border border-gray-800 bg-[#0a0a0f] hover:border-gray-700 transition-colors">
              <div className="flex items-center space-x-4">
                <FileText className="text-gray-500" size={20} />
                <div>
                  <p className="text-sm font-medium text-gray-200">{title}</p>
                  <p className="text-xs text-gray-500">{description}</p>
                </div>
              </div>
              {urlCheck.ok ? (
                <SafeExternalLink
                  href={evidence.url}
                  className="text-sm text-gray-400 hover:text-white flex items-center transition-colors"
                  aria-label={`View evidence: ${title || description || "link"} (opens in new tab)`}
                >
                  View <ExternalLink size={14} className="ml-1" aria-hidden="true" />
                </SafeExternalLink>
              ) : (
                <span
                  className="text-sm text-gray-600 flex items-center"
                  role="img"
                  aria-label="Evidence link blocked for security reasons"
                >
                  <ShieldAlert size={14} className="mr-1" aria-hidden="true" />
                  Blocked link
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};