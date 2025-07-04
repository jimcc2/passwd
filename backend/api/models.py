from django.db import models
from django.contrib.auth.models import User

class Credential(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    website_url = models.URLField()
    username = models.CharField(max_length=255)
    encrypted_password = models.TextField()
    encrypted_mfa_secret = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.website_url} ({self.username})"
