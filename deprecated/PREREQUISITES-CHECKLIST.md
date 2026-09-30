# Prerequisites — send to participants a day ahead

**Do all of this BEFORE the workshop.** It is not counted in the 90 minutes, and
the account/card/API-key steps are the usual bottleneck. Budget ~30 minutes.

## Accounts

- [ ] **Confluent Cloud account** — sign up at `confluent.cloud/signup`
      (new sign-ups get **$400 free credit for 30 days**).
- [ ] **Payment method on file** — Console → Billing & payment. Required even with
      credits; credit is spent first, so the workshop itself costs you nothing.
- [ ] **Cloud API key** — Console → Settings → **API keys** → *Cloud resource
      management*, scope "My account". Save the key **and** secret.
      ⚠️ **Do NOT create a Kafka cluster in the onboarding wizard** — Terraform
      creates it during the lab.
- [ ] **IBM Bob access** — confirm you can open Bob and it works.

## Local tools

| Tool | Version | Install |
|---|---|---|
| Git | any recent | https://git-scm.com |
| Python | ≥ 3.11 | https://python.org (tick "Add to PATH") |
| Terraform | ≥ 1.0 | `winget install Hashicorp.Terraform` (Win) · `brew install terraform` (mac) |

Verify in a terminal:

```bash
git --version
python --version
terraform -version
```

> Windows note: after `winget install Hashicorp.Terraform`, open a **new**
> terminal so `terraform` is found (winget registers it as an app-execution
> alias). If it still isn't found, sign out/in or use the full path under
> `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Hashicorp.Terraform_*\terraform.exe`.

## Get the skill/workspace

- [ ] Clone the Bob workspace so the skill is available:
      ```bash
      git clone https://github.com/bleporini/fraud-confluent-terraform-bob.git
      ```

## You are ready when

- [ ] `terraform -version`, `python --version`, `git --version` all print a version.
- [ ] You can log in to Confluent Cloud and see your Cloud API key.
- [ ] Billing shows a payment method + your free credit.
- [ ] Bob opens.
