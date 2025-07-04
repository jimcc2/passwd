# Use an official Python runtime as a parent image
FROM python:3.9-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container at /app
COPY backend/requirements.txt /app/

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the entire backend directory into the container at /app
COPY ./backend /app/

# The config file is outside the backend directory, so it won't be copied by the above line.
# We will mount it as a volume in docker-compose instead of copying it,
# to allow for external configuration.

# Expose the port the app runs on
EXPOSE 8000

# Run gunicorn
# It will look for the wsgi.py file in the password_manager directory
# The user will need to run migrations manually or we can add a startup script.
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "password_manager.wsgi:application"]
