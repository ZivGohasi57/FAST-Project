package core.models;

public class ManagerUser extends User {
    public ManagerUser() { super(); }

    public ManagerUser(String id, String username, String password, String displayName) {
        super(id, username, password, "manager", null, displayName);
    }
}
