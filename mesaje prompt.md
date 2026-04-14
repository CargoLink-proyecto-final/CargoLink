Continue the development of a messaging system between carriers (transportistas) and load generators (generadores de carga).

The system must enforce the following rules and features:
	1.	Messaging should only be enabled when a load has been successfully assigned or connected to a carrier. No messages should be allowed otherwise.
	2.	Each load (shipment/job) must have its own dedicated conversation thread between the assigned carrier and the load generator.
	3.	The system must store a complete history for every trip, including:
	•	Load details (type, origin, destination, description, etc.)
	•	Assigned carrier information
	•	Delivery status
	•	Date and time of assignment and completion
	•	Full message history exchanged during that trip
	4.	Conversations must be strictly linked to a specific trip and should not be reusable across different loads.
	5.	Ensure proper data modeling for scalability and traceability (e.g., entities like Users, Loads, Trips, Messages, Conversations).
	6.	Include backend logic, database schema suggestions, and API endpoints required to support this functionality.