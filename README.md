# RescueBite

A surplus-food marketplace connecting businesses with consumers to reduce food waste through discounted food listings.

## 1. Application Demo Details

**Application: https://rescuebite.tancysam.dev/**

| Account | Username | Password |
|---|---|---|
| Consumer | `demo_consumer` | `DEMO_CONSUMER_@1234` |
| Business | `demo_business` | `DEMO_BUSINESS_@1234` |

**Source code:** https://github.com/tancysam/WAD2-G8T8-RescueBite

## 2. Utilizing the application

### Test payment details

Use these details when you make a purchase as a comsumer in **Stripe**

| Field | Value |
|---|---|
| Card number | `4242 4242 4242 4242` |
| Name | Any name |
| Email | Any valid email-format address |
| Expiry date | Any future date |
| CVV | Any three digits |

You can also use the business account to create and edit food listings, upload images, and request AI-assisted listing suggestions.

## 3. Runing locally

### Prerequisites

- Node.js 24.21.0.
- pnpm version 12.9.1.
- MongoDB database.
- Configured Clerk credentials.
- Credentials for Google Maps, Amazon S3, OpenAI, and Stripe

### Step 1: Clone the project

Clone the repository:

```bash
git clone https://github.com/tancysam/WAD2-G8T8-RescueBite.git
cd WAD2-G8T8-RescueBite
```

### Step 2: Install dependencies

From the application root:

```bash
cd backend
pnpm install

cd ../frontend
pnpm install

cd ..
```

### Step 3: Configure the environment

Copy `.env.example` to `.env` in the application root:

```bash
cp .env.example .env
```

Configure the following values:

| Variable | Value or purpose |
|---|---|
| `VITE_API_URL` | `http://localhost:8080/api` |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk frontend publishable key |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps browser API key |
| `FRONTEND_URL` | `http://localhost:5173` |
| `MONGO_URI` | MongoDB connection string |
| `CLERK_PUBLISHABLE_KEY` | Clerk backend publishable key |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `AWS_REGION` | S3 bucket region |
| `AWS_S3_BUCKET` | Listing-image bucket name |
| `AWS_ACCESS_KEY_ID` | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `AWS_SESSION_TOKEN` | Session token if using temporary credentials; otherwise leave empty |
| `OPENAI_API_KEY` | OpenAI API key |
| `OPENAI_MODEL` | Model supporting image input and structured outputs |
| `STRIPE_SECRET_KEY` | Stripe test secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_SUCCESS_URL` | `http://localhost:5173/my-orders` |
| `STRIPE_CANCEL_URL` | `http://localhost:5173/my-orders` |

Use Clerk keys from the same application for both frontend and backend. Configure Google Maps restrictions and S3 upload CORS rules to allow `http://localhost:5173`.

### Step 4: Start the backend

In a terminal at the application root:

```bash
cd backend
pnpm run dev
```

The backend starts at:

```text
http://localhost:8080
```

### Step 5: Start the frontend

In a second terminal at the application root:

```bash
cd frontend
pnpm run dev -- --port 5173 --strictPort
```

Open:

**http://localhost:5173/**

Use frontend port `5173`, as this is the origin allowed by the backend’s current local CORS configuration.

## 5. Troubleshooting

| Issue | What to check |
|---|---|
| Backend does not start | Check `MONGO_URI` and database access. Run the command from the `backend` directory. |
| Frontend cannot connect | Confirm the backend is running on port `8080`, the frontend is on `5173`, and `VITE_API_URL` is correct. |
| Local demo login fails | Hosted demo accounts are not automatically available in a separate Clerk instance or database. |
| No categories or listings appear | Check database contents, listing status, stock, collection windows, and filters. |
| Image upload fails | Check S3 permissions and browser-upload CORS settings. |
| Payment remains pending | Check Stripe credentials, webhook forwarding, the signing secret, and backend logs. |
| Camera scanning fails | Allow camera access and use localhost or HTTPS. |

Restart the relevant server after changing environment variables.

## 6. About RescueBite

RescueBite helps businesses recover value from surplus food while giving consumers access to discounted meals and food items.

Consumers can discover nearby listings, save favourites, reserve food, pay through Stripe, and collect using a QR code. Eligible nearby listings can be paired into discounted bundles.

Businesses can manage profiles and listings, upload food images, request AI-assisted listing suggestions, manage incoming orders, and verify collections.

### Technology stack

| Area | Technologies |
|---|---|
| Frontend | Vue 3, Vue Router, Vite, Bootstrap, Axios |
| Backend | Node.js, Express |
| Database | MongoDB, Mongoose |
| Authentication | Clerk |
| Maps | Google Maps |
| Payments | Stripe Checkout |
| Image storage | Amazon S3 |
| Listing suggestions | OpenAI |
| QR generation and scanning | QRServer, html5-qrcode |

## 7. AI/LLM usage

During the development of this project, AI/LLM tools were used as supplementary learning and development aids, primarily for the following purposes:

1. **Design Exploration and Prototyping**

AI was used to rapidly generate and explore different UI/UX design concepts, layouts, and prototypes, providing inspiration for the application's overall design.

2. **Learning and Understanding New Technologies**

AI was used as a learning resource to help us understand technologies and services beyond the scope of our curriculum, including Stripe integration, AWS S3 storage, QR code generation, and Clerk Authentication. This helped us understand relevant technical concepts, documentation, and integration approaches.

3. **Debugging Assistance and Performance Optimization Guidance**

AI was used to explain error messages, suggest debugging approaches, and provide guidance on potential performance improvements, such as pagination and database query optimization. These suggestions were evaluated and applied by our team as appropriate.

