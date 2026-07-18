MASTER SYSTEM DESIGN BRIEF
Agentic DevSecOps Factory v1.0
Prepared for Claude Code Planning & Implementation
OBJECTIVE

Design and implement a fully portable, security-first, AI-native software factory capable of building, reviewing, testing, deploying, monitoring, and maintaining production web applications while minimizing frontier-model costs.

The system must:

Use Linear as the operational source of truth
Use GitHub as the source of code truth
Use Railway for deployment
Use Claude Code as the primary engineering agent
Use Codex as independent reviewer
Use Ollama/local models for commodity tasks
Use RTK for context compression and token reduction
Support seamless transition between multiple developer workstations
Automatically provision and load MCP servers
Maintain security controls and human approval gates
Provide observability into agent activity and workload distribution
CORE DESIGN PRINCIPLES
Principle 1

Humans approve risk.

AI may:

Design
Implement
Review
Test
Document

AI may not:

Approve production releases
Approve database migrations
Approve payment changes
Approve identity/authentication changes
Approve security exceptions
Approve secret modifications
Principle 2

Linear is the operational truth.

All work originates in Linear.

No coding occurs without:

Issue
Scope
Acceptance Criteria
Threat Model
Test Plan
Principle 3

GitHub is the code truth.

All modifications occur via:

Issue
→ Branch
→ Pull Request
→ Review
→ Merge

No direct commits to protected branches.

Principle 4

Security exists in every layer.

Security is not a phase.

Security is a continuous workflow.

FACTORY ARCHITECTURE
Human
 │
 ▼
Linear
 │
 ▼
Planning Agents
 │
 ▼
Implementation Agents
 │
 ▼
Review Agents
 │
 ▼
Security Agents
 │
 ▼
GitHub
 │
 ▼
CI/CD
 │
 ▼
Railway Preview
 │
 ▼
Human Approval
 │
 ▼
Production
 │
 ▼
Observability
WORK MANAGEMENT LAYER

Primary Platform:

Linear

Linear responsibilities:

Ideas
Backlog
Projects
Roadmaps
Bugs
Incidents
Release tracking

Issue states:

Backlog
Ready for Spec
Spec Review
Ready for Build
In Progress
Security Review
QA
Ready for Production
Released
Blocked
Incident

Every issue contains:

Goal
Acceptance Criteria
Threat Model
Test Plan
Rollback Plan
Cost Impact
Security Impact
AI WORKFORCE
Claude Code

Role:

Senior Principal Engineer

Responsibilities:

Architecture
Feature Development
Refactoring
Technical Design
System Design
Infrastructure Design

Permissions:

Branch Creation
Pull Request Creation

Cannot:

Deploy Production
Modify Secrets
Approve Own PR
Codex

Role:

Independent Reviewer

Responsibilities:

Code Review
Security Review
Alternative Implementations
Test Generation
Bug Reproduction

Must review:

Auth Changes
Database Changes
Security Changes
Ollama Cluster

Role:

Commodity Task Execution

Responsibilities:

Documentation
Changelog Generation
Ticket Summaries
Unit Tests
Log Analysis
Knowledge Base Processing

Preferred Models:

Qwen Coder
DeepSeek Coder
Llama
Mistral
Phi
MODEL ROUTING

Deploy LiteLLM.

Routing rules:

Ollama

Use for:

Documentation
Summaries
Changelogs
Ticket Grooming
Basic Unit Tests
Log Summaries
Claude

Use for:

Architecture
Complex Coding
Infrastructure
Security Analysis
Planning
Codex

Use for:

Review
Verification
Independent Assessment

Fallback Rules:

If local model fails twice:

Escalate to Claude.

COST OPTIMIZATION

Deploy RTK.

RTK responsibilities:

Compress terminal output
Compress build logs
Compress test output
Compress git output
Compress CI output

Required RTK usage:

git status
git diff
git log

pnpm test
npm test

eslint
tsc

playwright

docker logs
railway logs

Raw logs must still be preserved for:

Security incidents
Audits
Production outages
PORTABLE DEVELOPMENT ENVIRONMENT

Requirement:

Developer can move between:

Laptop
Desktop
Workstation
Cloud Box

without reconfiguration.

Implement:

GitHub
  ↓
Dev Container
  ↓
VS Code

Repository:

devops-control-plane

Contains:

agents/
prompts/
policies/
docs/
scripts/
dashboards/
config/
mcp/
bootstrap/
MCP PLATFORM

Requirement:

All MCP servers automatically available every session.

No manual startup.

Single source:

mcp/registry.json

Bootstrap process installs and syncs configurations into:

Claude Code
Codex
Cursor
VS Code
REQUIRED MCP INTEGRATIONS
Work Management

Linear MCP

Capabilities:

Create Issues
Update Issues
Search Projects
Comment
Source Control

GitHub MCP

Capabilities:

Search Code
Create Branches
Create PRs
Review PRs
Runtime Monitoring

Sentry MCP

Capabilities:

Error Lookup
Release Monitoring
Stack Trace Analysis
Documentation

Context7 MCP

Capabilities:

Framework Documentation
Dependency Documentation
Best Practices
Design

Figma MCP

Capabilities:

Read Designs
Export Specs
Generate Components
Database
Neon PostgreSQL MCP

Default:

Read-only

Capabilities:

Schema Inspection
Query Analysis
Migration Review
MongoDB MCP

Default:

Read-only

Capabilities:

Collection Inspection
Query Review
Browser Automation

Playwright MCP

Capabilities:

E2E Testing
UI Validation
Screenshot Capture
CUSTOM MCP WRAPPERS TO BUILD

Create internal MCP servers for:

Clerk

Functions:

User Lookup
Session Inspection
Auth Configuration Review
id.me

Functions:

Identity Workflow Inspection

No production modifications.

Meilisearch

Functions:

Index Inspection
Search Testing
Snyk

Functions:

Dependency Scanning
Container Scanning
Semgrep

Functions:

Security Rule Execution
Findings Retrieval
SonarQube

Functions:

Code Quality Reports
Technical Debt Metrics
Resend

Functions:

Email Template Review
Test Email Sending

Sandbox only.

Cloudflare R2

Functions:

Object Inspection
Bucket Review

No production deletes.

Railway

Functions:

Deployment Inspection
Preview Environment Control

No production deployment permission.

Magic21

Functions:

API Execution
AI Tooling
DATA LAYER
Primary Relational Database

Neon PostgreSQL

Use for:

Users
Transactions
Business Data
Secondary Document Store

MongoDB

Use for:

Events
AI Conversations
Logs
Flexible Documents
Search Layer

Meilisearch

Use for:

Application Search
Knowledge Search
Storage Layer

Cloudflare R2

Use for:

Uploads
Images
Artifacts
Backups
AUTHENTICATION

Primary:

Clerk

Responsibilities:

Login
Registration
Sessions
MFA

Identity Verification:

id.me

Responsibilities:

Identity Validation
High Assurance Verification
EMAIL

Provider:

Resend

Use for:

Notifications
Verification Emails
Transactional Emails
OBSERVABILITY

Build a VS Code extension:

Agent Observation Deck

Purpose:

Provide visibility into factory operations.

Metrics

Track:

Agent Metrics
Claude
Codex
Ollama
Human
Tool Metrics
Linear
GitHub
Sentry
Figma
Neon
MongoDB
Meilisearch
Railway
AI Metrics
Token Usage
Cost
Savings
RTK Metrics
Compression %
Tokens Saved
Estimated Cost Avoided
Visualization

Provide:

Bubble Chart

Representing:

Workload Share
Agent Activity
Cost Consumption

Example:

Claude   30%
Codex    20%
Ollama   35%
Human    10%
Other     5%
SECURITY PROGRAM

Mandatory scans:

CodeQL
Semgrep
Snyk
Gitleaks
Trivy
Playwright

Every Pull Request requires:

Lint
Type Check
Build
Unit Tests
Security Scan
Dependency Scan
DEPLOYMENT STRATEGY

Railway environments:

feature/*
  ↓
Preview

staging
  ↓
Staging

main
  ↓
Production

Rules:

No automatic production deployment.

Human approval required.

KNOWLEDGE SYSTEM

Create local knowledge platform.

Store:

Architecture Decisions
Postmortems
Threat Models
Security Reviews
Runbooks
Patterns

Embed locally.

Preferred embedding model:

nomic-embed-text
PHASED IMPLEMENTATION PLAN

Phase 1

Create control-plane repository
Create devcontainer
Create bootstrap system

Phase 2

Deploy Ollama server
Deploy LiteLLM
Configure RTK

Phase 3

Configure MCP ecosystem
Build MCP wrappers

Phase 4

Configure GitHub security
Configure Railway environments

Phase 5

Build Observation Deck

Phase 6

Build Knowledge Platform

Phase 7

Run first project through full workflow

Success Criteria:

A developer can sit down at any workstation, clone the control-plane repository, open VS Code, and immediately access the same agents, MCP integrations, security controls, deployment workflows, knowledge systems, and observability dashboards with minimal manual configuration.