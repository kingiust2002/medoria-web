# VPS purchase and acceptance checklist

Use this checklist before paying for a server and immediately after delivery. It is intentionally provider-neutral because prices and inventory change.

## Required purchase profile

For the initial one-server Medoria staging and later combined application/Supabase deployment:

- architecture: `x86_64` / `amd64` only;
- CPU: 8 shared vCPU from Intel or AMD;
- RAM: 16 GB;
- disk: at least 160 GB NVMe SSD;
- traffic: at least 5 TB/month; 20 TB is preferable;
- network: one dedicated public IPv4 plus IPv6 if available;
- operating system: Ubuntu 24.04 LTS;
- access: full root/SSH and provider web console;
- location: Germany or Finland;
- billing: one month first, not annual prepayment;
- snapshot/reinstall capability from the provider panel;
- Docker and long-running server processes explicitly allowed.

Do not buy an ARM/Ampere plan for this migration. The application can be made multi-architecture, but the chosen and tested deployment baseline is amd64. Avoid introducing architecture-specific failure modes during the infrastructure migration.

## Questions to send the provider before payment

Obtain written confirmation for each item:

1. Is the CPU architecture definitely Intel/AMD `x86_64`, not ARM/Ampere?
2. Is the IPv4 dedicated and included in the advertised monthly price?
3. Are ports TCP 22/80/443 and UDP 443 available without provider filtering?
4. Is Docker Engine/Compose permitted?
5. Is full root SSH access provided?
6. Is a browser console available if SSH or firewall configuration fails?
7. Can Ubuntu 24.04 LTS be reinstalled from the panel?
8. Are snapshots available, and what do they cost?
9. Is the disk NVMe and is the advertised capacity usable after provisioning?
10. What is the renewal price after the first month?
11. Is VAT included?
12. What happens to data and backups if payment is late or the upstream server account is suspended?
13. Is there any restriction on PostgreSQL, reverse proxies, object storage, or commercial websites?
14. Is one reverse-DNS/PTR record available if email delivery is ever added?

Do not rely on a sales-page CPU/RAM number alone. Shared CPU plans can vary materially in steal time and disk performance.

## Information that must never be sent in chat

- root password;
- SSH private key;
- recovery codes;
- provider account password;
- API token;
- payment information;
- production environment file.

The following non-secret details are sufficient for guided provisioning:

- provider and plan name;
- location;
- architecture;
- OS and version;
- public IP address;
- SSH username;
- actual SSH port, if changed;
- outputs from the repository's read-only VPS preflight script.

## Acceptance procedure after delivery

Before installing application services:

```bash
uname -m
cat /etc/os-release
nproc
free -h
df -h /
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS
systemd-detect-virt
```

Clone the migration branch or copy only the verification script, then run:

```bash
bash scripts/self-host/verify-vps.sh
```

The standard thresholds are:

- at least 8 vCPU;
- at least 15,000 MB visible RAM;
- at least 145 GiB root filesystem for an advertised 160 GB disk;
- `amd64`/`x86_64` architecture;
- PostgreSQL and pooler ports not publicly listening.

Providers usually advertise decimal GB, while Linux reports binary GiB. A 160 GB disk is about 149 GiB before partition and filesystem overhead; the 145 GiB floor avoids rejecting a correctly provisioned 160 GB plan.

## Performance acceptance tests

Run before placing data on the server:

```bash
sudo apt update
sudo apt install -y fio sysbench

fio --name=medoria-randread \
  --filename=/tmp/medoria-fio.test \
  --size=2G \
  --rw=randread \
  --bs=4k \
  --iodepth=32 \
  --direct=1 \
  --runtime=60 \
  --time_based \
  --group_reporting

sysbench cpu --threads=8 --time=60 run
rm -f /tmp/medoria-fio.test
```

Record the full outputs. These are baseline measurements, not universal pass/fail numbers. Compare repeated tests at different times. Large variance, persistent CPU steal, I/O stalls, or unexplained packet loss are grounds to reject the server during any refund window.

Check CPU steal while load is running:

```bash
vmstat 1 60
```

A consistently high `st` column indicates an oversold host.

## Network acceptance tests

From the server:

```bash
curl -4 https://ifconfig.co
ping -c 20 1.1.1.1
ping -c 20 8.8.8.8
```

From a separate Internet connection, verify SSH and later HTTPS reachability. Do not change the production DNS during acceptance testing.

## Decision rule

Accept the server only when:

- all advertised resources are visible;
- architecture and OS match the required profile;
- root and console recovery work;
- disk and CPU results are stable across repeated tests;
- no required port is blocked;
- the provider has answered the operational questions;
- the first payment is monthly and reversible.

After acceptance, run the guarded bootstrap:

```bash
sudo ALLOW_VPS_BOOTSTRAP=YES \
  bash scripts/self-host/bootstrap-vps.sh
```

Then rerun:

```bash
bash scripts/self-host/verify-vps.sh
```
