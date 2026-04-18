import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PrivacyPolicyPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccepted: () => void;
  loading?: boolean;
}

export function PrivacyPolicyPanel({ open, onOpenChange, onAccepted, loading }: PrivacyPolicyPanelProps) {
  const [agreed, setAgreed] = useState(false);

  const handleAccept = () => {
    if (!agreed) return;
    onAccepted();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" resizeKey="privacy-policy" className="w-full sm:max-w-2xl flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="text-xl">Tech Fleet Privacy Policy</SheetTitle>
          <SheetDescription>
            Please read the full privacy policy below and confirm your acceptance.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            <h2 className="text-lg font-bold text-foreground">Privacy Policy</h2>
            <p className="text-xs text-muted-foreground">Effective Date: 23-Jan-2023 · Last Updated: 01-Aug-2024</p>
            <p className="text-sm text-muted-foreground">
              This Privacy Policy ("Policy") applies to Tech Fleet Discord, and Tech Fleet Professional Association Inc. ("Company")
              and governs data collection and usage. For the purposes of this Privacy Policy, unless otherwise noted, all references
              to the Company include https://techfleet.org. The Company's application is an online community platform application.
              By using the Company application, you consent to the data practices described in this statement.
            </p>

            <h3 className="text-base font-semibold text-foreground">Collection of your Personal Information</h3>
            <p className="text-sm text-muted-foreground">
              In order to better provide you with products and services offered, the Company may collect personally identifiable information, such as your:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">
              <li>First and last name</li>
              <li>Mailing address</li>
              <li>Email address</li>
              <li>Phone number</li>
            </ul>
            <p className="text-sm text-muted-foreground">
              If you purchase the Company's products and services, we collect billing and credit card information. This information is used to complete the purchase transaction.
            </p>
            <p className="text-sm text-muted-foreground">
              The Company may also collect anonymous demographic information, which is not unique to you, such as your age.
            </p>
            <p className="text-sm text-muted-foreground">
              We do not collect any personal information about you unless you voluntarily provide it to us. However, you may be required to provide certain personal information to us when you elect to use certain products or services. These may include: (a) registering for an account; (b) entering a sweepstakes or contest sponsored by us or one of our partners; (c) signing up for special offers from selected third parties; (d) sending us an email message; (e) submitting your credit card or other payment information when ordering and purchasing products and services. To wit, we will use your information for, but not limited to, communicating with you in relation to services and/or products you have requested from us. We also may gather additional personal or non-personal information in the future.
            </p>

            <h3 className="text-base font-semibold text-foreground">Use of your Personal Information</h3>
            <p className="text-sm text-muted-foreground">The Company collects and uses your personal information in the following ways:</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">
              <li>To operate and deliver the services you have requested</li>
              <li>To provide you with information, products, or services that you request from us</li>
              <li>To provide you with notices about your account</li>
              <li>To carry out the Company's obligations and enforce our rights arising from any contracts entered between you and us, including for billing and collection</li>
              <li>To notify you about changes to our Tech Fleet Discord or any products or services we offer or provide through it</li>
              <li>In any other way we may describe when you provide the information</li>
              <li>For any other purpose with your consent</li>
            </ul>
            <p className="text-sm text-muted-foreground">
              The Company may also use your personally identifiable information to inform you of other products or services available from the Company and its affiliates.
            </p>

            <h3 className="text-base font-semibold text-foreground">Sharing Information with Third Parties</h3>
            <p className="text-sm text-muted-foreground">
              The Company does not sell, rent, or lease its customer lists to third parties.
            </p>
            <p className="text-sm text-muted-foreground">
              The Company may, from time to time, contact you on behalf of external business partners about a particular offering that may be of interest to you. In those cases, your unique personally identifiable information (email, name, address, phone number) is not transferred to the third party. The Company may share data with trusted partners to help perform statistical analysis, send you email or postal mail, provide customer support, or arrange for deliveries. All such third parties are prohibited from using your personal information except to provide these services to the Company, and they are required to maintain the confidentiality of your information.
            </p>
            <p className="text-sm text-muted-foreground">
              The Company may disclose your personal information, without notice, if required to do so by law or in the good faith belief that such action is necessary to: (a) conform to the edicts of the law or comply with legal process served on the Company or the site; (b) protect and defend the rights or property of the Company; and/or (c) act under exigent circumstances to protect the personal safety of users of the Company, or the public.
            </p>

            <h3 className="text-base font-semibold text-foreground">Security of your Personal Information</h3>
            <p className="text-sm text-muted-foreground">
              The Company secures your personal information from unauthorized access, use, or disclosure. The Company uses the following methods for this purpose:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">
              <li>Cloudflare</li>
              <li>Let'sEncrypt SSL Certificates</li>
            </ul>
            <p className="text-sm text-muted-foreground">
              We strive to take appropriate security measures to protect against unauthorized access to or alteration of your personal information. Unfortunately, no data transmission over the Internet or any wireless network can be guaranteed to be 100% secure. As a result, while we strive to protect your personal information, you acknowledge that: (a) there are security and privacy limitations inherent to the Internet that are beyond our control; and (b) the security, integrity, and privacy of any and all information and data exchanged between you and us through this site cannot be guaranteed.
            </p>

            <h3 className="text-base font-semibold text-foreground">Right to Deletion</h3>
            <p className="text-sm text-muted-foreground">
              Subject to certain exceptions set out below, on receipt of a verifiable request from you, we will:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">
              <li>Delete your personal information from our records</li>
              <li>Direct any service providers to delete your personal information from their records</li>
            </ul>
            <p className="text-sm text-muted-foreground">
              Please note that we may not be able to comply with requests to delete your personal information if it is necessary to:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">
              <li>Complete the transaction for which the personal information was collected, fulfill the terms of a written warranty or product recall conducted in accordance with federal law, and provide a good or service requested by you, or reasonably anticipated within the context of our ongoing business relationship with you, or otherwise perform a contract between you and us</li>
              <li>Detect security incidents, protect against malicious, deceptive, fraudulent, or illegal activity; or prosecute those responsible for that activity</li>
              <li>Debug to identify and repair errors that impair existing intended functionality</li>
              <li>Exercise free speech, ensure the right of another consumer to exercise his or her right of free speech, or exercise another right provided for by law</li>
              <li>Comply with the California Electronic Communications Privacy Act</li>
              <li>Engage in public or peer-reviewed scientific, historical, or statistical research in the public interest that adheres to all other applicable ethics and privacy laws</li>
              <li>Enable solely internal uses that are reasonably aligned with your expectations based on your relationship with us</li>
              <li>Comply with an existing legal obligation</li>
              <li>Otherwise use your personal information, internally, in a lawful manner that is compatible with the context in which you provided the information</li>
            </ul>

            <h3 className="text-base font-semibold text-foreground">Children Under Thirteen</h3>
            <p className="text-sm text-muted-foreground">
              The Company does not knowingly collect personally identifiable information from children under the age of 13. If you are under the age of 13, you must ask your parent or guardian for permission to use this application.
            </p>

            <h3 className="text-base font-semibold text-foreground">Email Communications</h3>
            <p className="text-sm text-muted-foreground">
              From time to time, the Company may contact you via email for the purpose of providing announcements, promotional offers, alerts, confirmations, surveys, and/or other general communication. In order to improve our services, we may receive a notification when you open an email from the Company or click on a link therein.
            </p>
            <p className="text-sm text-muted-foreground">
              If you would like to stop receiving marketing or promotional communications via email from the Company, you may opt out of such communications by clicking on the unsubscribe button from the mailing list email they receive, or replying to the email and requesting to be taken off the email contact list, or emailing info@techfleet.org and requesting to be taken off the email communication list.
            </p>

            <h3 className="text-base font-semibold text-foreground">External Data Storage Sites</h3>
            <p className="text-sm text-muted-foreground">
              We may store your data on servers provided by third-party hosting vendors with whom we have contracted.
            </p>

            <h3 className="text-base font-semibold text-foreground">Changes to This Statement</h3>
            <p className="text-sm text-muted-foreground">
              The Company reserves the right to change this Policy from time to time. For example, when there are changes in our services, changes in our data protection practices, or changes in the law. When changes to this Policy are significant, we will inform you. Your continued use of the application and/or services available after such modifications will constitute your: (a) acknowledgment of the modified Policy; and (b) agreement to abide and be bound by that Policy.
            </p>

            <h3 className="text-base font-semibold text-foreground">Contact Information</h3>
            <p className="text-sm text-muted-foreground">
              The Company welcomes your questions or comments regarding this Policy. If you believe that the Company has not adhered to this Policy, please contact the Company at:
            </p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Tech Fleet Professional Association Inc.</p>
              <p>8 The Grn, Suite 6369</p>
              <p>Dover, Delaware 19901</p>
              <p>Email: <a href="mailto:info@techfleet.org" className="text-primary underline">info@techfleet.org</a></p>
              <p>Phone: 302-497-4065</p>
            </div>
            <p className="text-xs text-muted-foreground italic">Effective as of August 01, 2024</p>
          </div>
        </ScrollArea>

        <div className="border-t px-6 py-4 space-y-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="agree-privacy"
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked === true)}
              className="mt-0.5"
            />
            <label htmlFor="agree-privacy" className="text-sm text-foreground leading-snug cursor-pointer">
              I have read and agree to the Tech Fleet Privacy Policy.
            </label>
          </div>
          <Button
            onClick={handleAccept}
            disabled={!agreed || loading}
            className="w-full"
          >
            {loading ? "Saving…" : "Accept Privacy Policy"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
